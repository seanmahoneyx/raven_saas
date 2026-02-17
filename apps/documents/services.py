# apps/documents/services.py
"""
Service layer for file attachment management.

Provides:
- AttachmentService: Upload, delete, and retrieve file attachments
"""
import os
import logging
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib.contenttypes.models import ContentType

from .models import Attachment

logger = logging.getLogger(__name__)


class AttachmentService:
    """
    Service for managing file attachments.

    Handles:
    - File validation (extension, size)
    - Upload and storage
    - Thumbnail generation for images (via Pillow)
    - Deletion (file + record)
    - Querying attachments for any object

    Usage:
        svc = AttachmentService(tenant=request.tenant, user=request.user)
        attachment = svc.upload(file_obj, invoice, description='Q2 Invoice')
        attachments = svc.get_attachments(invoice)
        svc.delete(attachment)
    """

    ALLOWED_EXTENSIONS = {
        '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
        '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
    }
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
    THUMBNAIL_SIZE = (200, 200)

    CATEGORY_MAP = {
        '.pdf': 'document',
        '.doc': 'document', '.docx': 'document',
        '.xls': 'spreadsheet', '.xlsx': 'spreadsheet', '.csv': 'spreadsheet',
        '.txt': 'document',
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
        '.gif': 'image', '.webp': 'image',
    }

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def _get_extension(self, filename: str) -> str:
        return Path(filename).suffix.lower()

    def validate(self, file) -> list[str]:
        """
        Validate a file object. Returns list of error messages (empty = valid).
        """
        errors = []
        ext = self._get_extension(file.name)
        if ext not in self.ALLOWED_EXTENSIONS:
            errors.append(
                f"File type '{ext}' is not allowed. "
                f"Allowed: {', '.join(sorted(self.ALLOWED_EXTENSIONS))}"
            )
        if file.size > self.MAX_FILE_SIZE:
            mb = file.size / (1024 * 1024)
            errors.append(f"File size {mb:.1f}MB exceeds maximum of 10MB.")
        return errors

    def upload(self, file, content_object, description='') -> Attachment:
        """
        Validate and upload a file, creating an Attachment record.

        Args:
            file: Django UploadedFile object
            content_object: Any Django model instance to attach to
            description: Optional description string

        Returns:
            Attachment instance

        Raises:
            ValueError: If validation fails
        """
        errors = self.validate(file)
        if errors:
            raise ValueError('; '.join(errors))

        filename = file.name
        ext = self._get_extension(filename)
        mime_type = getattr(file, 'content_type', '') or ''
        category = self.CATEGORY_MAP.get(ext, 'other')
        ct = ContentType.objects.get_for_model(content_object)

        attachment = Attachment(
            tenant=self.tenant,
            content_type=ct,
            object_id=content_object.pk,
            filename=filename,
            mime_type=mime_type,
            file_size=file.size,
            category=category,
            description=description,
            uploaded_by=self.user,
        )
        attachment.file = file
        attachment.save()

        # Generate thumbnail for images
        if ext in self.IMAGE_EXTENSIONS:
            try:
                self._generate_thumbnail(attachment)
            except Exception as exc:
                logger.warning("Thumbnail generation failed for %s: %s", filename, exc)

        return attachment

    def delete(self, attachment: Attachment) -> None:
        """
        Delete an attachment: removes files from storage and deletes the record.
        """
        # Delete the main file
        if attachment.file:
            try:
                if default_storage.exists(attachment.file.name):
                    default_storage.delete(attachment.file.name)
            except Exception as exc:
                logger.warning("Failed to delete file %s: %s", attachment.file.name, exc)

        attachment.delete()

    def get_attachments(self, content_object):
        """
        Return all attachments for a given model instance, scoped to the tenant.
        """
        ct = ContentType.objects.get_for_model(content_object)
        return Attachment.objects.filter(
            content_type=ct,
            object_id=content_object.pk,
        ).select_related('content_type', 'uploaded_by')

    def _generate_thumbnail(self, attachment: Attachment) -> None:
        """
        Generate a 200x200 thumbnail for image attachments using Pillow.
        Stores the thumbnail path in attachment.description (metadata only;
        the model doesn't have a separate thumbnail field).
        """
        try:
            from PIL import Image
        except ImportError:
            logger.warning("Pillow not installed; skipping thumbnail generation.")
            return

        # Read the file content
        attachment.file.seek(0)
        image_data = attachment.file.read()
        attachment.file.seek(0)

        img = Image.open(BytesIO(image_data))
        img.thumbnail(self.THUMBNAIL_SIZE, Image.LANCZOS)

        # Convert to RGB if necessary (e.g., PNG with alpha -> JPEG)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        thumb_buffer = BytesIO()
        img.save(thumb_buffer, format='JPEG', quality=85, optimize=True)
        thumb_buffer.seek(0)

        # Build thumbnail path alongside original
        original_name = attachment.file.name
        base, _ = os.path.splitext(original_name)
        thumb_name = f"{base}_thumb.jpg"

        saved_path = default_storage.save(
            thumb_name.replace('attachments/', 'thumbnails/'),
            ContentFile(thumb_buffer.read()),
        )
        logger.debug("Thumbnail saved to %s", saved_path)
