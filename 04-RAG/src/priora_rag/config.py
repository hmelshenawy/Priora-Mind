import os

from dotenv import load_dotenv


load_dotenv()


QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "default")
QDRANT_TIMEOUT = int(os.getenv("QDRANT_TIMEOUT", "60"))

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1024"))
EMBEDDING_BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))

QDRANT_UPSERT_BATCH_SIZE = int(os.getenv("QDRANT_UPSERT_BATCH_SIZE", "32"))

CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "240"))

RETRIEVAL_LIMIT = int(os.getenv("RAG_TOP_K", "3"))
SCORE_THRESHOLD = float(os.getenv("RAG_SCORE_THRESHOLD", "0.4"))

MAX_SOURCE_BYTES = int(os.getenv("RAG_MAX_SOURCE_BYTES", str(10 * 1024 * 1024)))

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
SERVICE_TOKEN = os.getenv("RAG_SERVICE_TOKEN")
