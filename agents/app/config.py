"""Settings, read once from the environment (and agents/.env locally)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Cognee keeps its LanceDB vectors, graph and metadata here, on the same disk as app.db.
os.environ.setdefault("SYSTEM_ROOT_DIRECTORY", str(DATA_DIR / "cognee" / "system"))
os.environ.setdefault("DATA_ROOT_DIRECTORY", str(DATA_DIR / "cognee" / "data"))

AGENTS_SECRET = os.environ.get("AGENTS_SECRET", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1"
AGENT_MODEL = os.environ.get("AGENT_MODEL", "deepseek/deepseek-v4.1-flash")
RESEARCH_WEB = os.environ.get("RESEARCH_WEB", "1") != "0"

# Cognee: the same OpenRouter model for building its graph (through LiteLLM), local fastembed for embeddings.
# Any of these can be overridden in the environment.
for key, value in {
    "LLM_PROVIDER": "custom",
    "LLM_MODEL": f"openrouter/{AGENT_MODEL}",
    "LLM_ENDPOINT": OPENROUTER_URL,
    "LLM_API_KEY": OPENROUTER_API_KEY,
    "EMBEDDING_PROVIDER": "fastembed",
    "EMBEDDING_MODEL": "BAAI/bge-small-en-v1.5",
    "EMBEDDING_DIMENSIONS": "384",
    "VECTOR_DB_PROVIDER": "lancedb",
    "TELEMETRY_DISABLED": "1",
    # Without an LLM key Cognee would download ~1 GB of PyTorch to extract graphs locally; never do that here.
    "GLINER_AUTO_INSTALL": "false",
}.items():
    os.environ.setdefault(key, value)

# Cognee Cloud (optional): after each graph build the user's graph is pushed there, so it shows up in the Cognee web app.
# Own names on purpose: Cognee's COGNEE_SERVICE_URL / COGNEE_API_KEY would send all memory calls to the cloud instead.
CLOUD_URL = os.environ.get("NETWORKOS_COGNEE_CLOUD_URL", "").strip().strip('"').rstrip("/")
CLOUD_KEY = os.environ.get("NETWORKOS_COGNEE_CLOUD_KEY", "").strip().strip('"')

# DeepSeek V4.1 Flash prices on OpenRouter, per million tokens, for the dashboard's Tokens / Cost tab.
PRICE_IN, PRICE_OUT = 0.028, 0.12
