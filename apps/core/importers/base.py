import csv
import io
from django.db import transaction


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
        """
        if hasattr(file, 'read'):
            content = file.read()
            if isinstance(content, bytes):
                content = content.decode('utf-8-sig')
        else:
            content = file

        reader = csv.DictReader(io.StringIO(content))
        rows = list(reader)
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
        rows, fieldnames = self.load_csv(file)

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

        # Wrap entire commit in a transaction that can be rolled back for dry run
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
