import csv
import io
from django.db import transaction

MAX_CSV_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_CSV_ROWS = 50_000


class BaseCsvImporter:
    """
    Base class for CSV data importers with dry-run support.

    Subclasses must implement:
    - required_columns: list of required CSV column headers
    - validate_row(row_num, row): validate a single row, return list of error strings
    - process_row(row_num, row): create/update model instance, return created object
    """
    required_columns = []

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def load_csv(self, file):
        """
        Parse uploaded CSV file into list of dicts.
        Handles both InMemoryUploadedFile and regular file objects.

        Raises:
            ValueError: if the file is not valid UTF-8 or exceeds MAX_CSV_ROWS.
        """
        if hasattr(file, 'read'):
            content = file.read()
            if isinstance(content, bytes):
                try:
                    content = content.decode('utf-8-sig')
                except (UnicodeDecodeError, ValueError):
                    raise ValueError('File is not valid UTF-8 CSV.')
        else:
            content = file

        reader = csv.DictReader(io.StringIO(content))
        rows = []
        for row in reader:
            rows.append(row)
            if len(rows) > MAX_CSV_ROWS:
                raise ValueError('CSV exceeds 50000 row limit.')
        return rows, reader.fieldnames or []

    def check_columns(self, fieldnames):
        """Verify required columns are present in CSV."""
        missing = [col for col in self.required_columns if col not in fieldnames]
        return missing

    def validate_row(self, row_num, row):
        """
        Validate a single row. Return list of error strings.
        Empty list = valid.
        """
        raise NotImplementedError

    def process_row(self, row_num, row):
        """
        Create or update model instance from row data.
        Return the created/updated object.
        """
        raise NotImplementedError

    def post_process(self):
        """
        Optional hook called after all rows are processed successfully.
        Override for bulk operations (e.g., creating a single JE for all rows).
        """
        pass

    def run(self, file, commit=False):
        """
        Orchestrate the import process.

        Args:
            file: Uploaded CSV file
            commit: If False, validate only (dry run). If True, save to DB.

        Returns:
            dict: {
                'total': int,
                'valid': int,
                'created': int,
                'updated': int,
                'errors': [{'row': int, 'message': str}, ...],
            }
        """
        # load_csv raises ValueError for encoding errors or row-count exceeded
        try:
            rows, fieldnames = self.load_csv(file)
        except ValueError as e:
            return {
                'total': 0,
                'valid': 0,
                'created': 0,
                'updated': 0,
                'errors': [{'row': 0, 'message': str(e)}],
            }

        # Check required columns
        missing = self.check_columns(fieldnames)
        if missing:
            return {
                'total': 0,
                'valid': 0,
                'created': 0,
                'updated': 0,
                'errors': [{'row': 0, 'message': f"Missing required columns: {', '.join(missing)}"}],
            }

        errors = []
        valid_count = 0
        created_count = 0
        updated_count = 0

        # Wrap entire operation in an atomic block so savepoint behaves
        # correctly regardless of ATOMIC_REQUESTS setting (F5).
        with transaction.atomic():
            sid = transaction.savepoint()
            try:
                for i, row in enumerate(rows, start=2):  # Row 2 = first data row (1 = header)
                    # Strip whitespace from all values
                    row = {k: (v.strip() if v else '') for k, v in row.items()}

                    row_errors = self.validate_row(i, row)
                    if row_errors:
                        for err in row_errors:
                            errors.append({'row': i, 'message': err})
                        continue

                    valid_count += 1

                    if commit and not errors:
                        result = self.process_row(i, row)
                        if result == 'created':
                            created_count += 1
                        elif result == 'updated':
                            updated_count += 1

                # Run post-processing hook (e.g., bulk JE creation)
                if commit and not errors:
                    self.post_process()

                # If dry run OR there were errors, roll back
                if not commit or errors:
                    transaction.savepoint_rollback(sid)
                else:
                    transaction.savepoint_commit(sid)

            except Exception as e:
                transaction.savepoint_rollback(sid)
                errors.append({'row': 0, 'message': f"Unexpected error: {str(e)}"})

        return {
            'total': len(rows),
            'valid': valid_count,
            'created': created_count,
            'updated': updated_count,
            'errors': errors,
        }
