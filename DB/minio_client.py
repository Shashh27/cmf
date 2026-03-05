from minio import Minio
from minio.error import S3Error
import io
import threading
from typing import BinaryIO
from datetime import timedelta


class MinIOClient:
    def __init__(
            self,
            endpoint: str,
            access_key: str,
            secret_key: str,
            bucket_name: str,
            secure: bool = False
    ):
        # Minio client is thread-safe internally; one instance shared across all workers
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self.bucket_name = bucket_name
        self.endpoint = endpoint
        self.secure = secure

        # Ensure bucket exists once at startup
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        """Create bucket if it doesn't exist"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                print(f"✓ Created bucket: {self.bucket_name}")
            else:
                print(f"✓ Bucket already exists: {self.bucket_name}")
        except S3Error as e:
            print(f"Error ensuring bucket exists: {e}")
            raise

    def upload_file(
            self,
            file_data: BinaryIO,
            object_name: str,
            content_type: str = "application/octet-stream",
            metadata: dict = None
    ) -> str:
        """
        Upload file to MinIO

        Args:
            file_data: File object or bytes
            object_name: Name/path for the object in MinIO
            content_type: MIME type of the file
            metadata: Optional metadata dictionary

        Returns:
            str: URL to access the uploaded file
        """
        try:
            # Get file size
            file_data.seek(0, 2)  # Seek to end
            file_size = file_data.tell()
            file_data.seek(0)  # Seek back to start

            # Upload file
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_name,
                data=file_data,
                length=file_size,
                content_type=content_type,
                metadata=metadata
            )

            # Generate URL
            protocol = "https" if self.secure else "http"
            url = f"{protocol}://{self.endpoint}/{self.bucket_name}/{object_name}"

            return url

        except S3Error as e:
            print(f"Error uploading file: {e}")
            raise

    def download_file(self, object_name: str) -> bytes:
        """
        Download file from MinIO

        Args:
            object_name: Name/path of the object in MinIO

        Returns:
            bytes: File content
        """
        try:
            response = self.client.get_object(self.bucket_name, object_name)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            print(f"Error downloading file: {e}")
            raise

    def delete_file(self, object_name: str) -> bool:
        """
        Delete file from MinIO

        Args:
            object_name: Name/path of the object in MinIO

        Returns:
            bool: True if deleted successfully
        """
        try:
            self.client.remove_object(self.bucket_name, object_name)
            return True
        except S3Error as e:
            print(f"Error deleting file: {e}")
            return False

    def file_exists(self, object_name: str) -> bool:
        """
        Check if file exists in MinIO

        Args:
            object_name: Name/path of the object in MinIO

        Returns:
            bool: True if file exists
        """
        try:
            self.client.stat_object(self.bucket_name, object_name)
            return True
        except S3Error:
            return False

    def get_presigned_url(self, object_name: str, expires: timedelta = timedelta(hours=1)) -> str:
        """
        Get presigned URL for temporary access

        Args:
            object_name: Name/path of the object in MinIO
            expires: Expiration time for the URL

        Returns:
            str: Presigned URL
        """
        try:
            url = self.client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=expires
            )
            return url
        except S3Error as e:
            print(f"Error generating presigned URL: {e}")
            raise

    def list_files(self, prefix: str = None) -> list:
        """
        List files in bucket

        Args:
            prefix: Filter files by prefix

        Returns:
            list: List of object names
        """
        try:
            objects = self.client.list_objects(
                self.bucket_name,
                prefix=prefix,
                recursive=True
            )
            return [obj.object_name for obj in objects]
        except S3Error as e:
            print(f"Error listing files: {e}")
            raise


# Global MinIO client instance — initialized once at startup, shared across all threads/workers
_minio_client: MinIOClient = None
_minio_lock = threading.Lock()


def get_minio_client() -> MinIOClient:
    """Get the global MinIO client instance (thread-safe)."""
    global _minio_client
    if _minio_client is None:
        raise RuntimeError("MinIO client not initialized. Call init_minio_client() at startup.")
    return _minio_client


def init_minio_client(
    endpoint: str,
    access_key: str,
    secret_key: str,
    bucket_name: str,
    secure: bool = False,
) -> MinIOClient:
    """Initialize the global MinIO client once at application startup (thread-safe)."""
    global _minio_client
    with _minio_lock:
        if _minio_client is None:
            _minio_client = MinIOClient(endpoint, access_key, secret_key, bucket_name, secure)
    return _minio_client