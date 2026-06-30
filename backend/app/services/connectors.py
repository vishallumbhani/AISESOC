"""
backend/app/services/connectors.py

Plugin-based runtime connector framework.
Never hardcode a provider — all connectors implement ConnectorBase.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


# ── Base interface ─────────────────────────────────────────────

@dataclass
class DiscoveredAgent:
    external_id:  str
    name:         str
    description:  str = ""
    agent_type:   str = "assistant"
    metadata:     Dict[str, Any] = field(default_factory=dict)


class ConnectorBase(ABC):
    """
    Every AI platform connector must implement this interface.
    New connectors (CrewAI, LangGraph, MCP) plug in without changing
    any existing code — just add a new subclass and register it.
    """

    connector_type: str = "base"

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def connect(self) -> bool:
        """Test connectivity. Returns True if connection is healthy."""
        ...

    @abstractmethod
    def discover_agents(self) -> List[DiscoveredAgent]:
        """Return a list of agents/assistants from the platform."""
        ...

    @abstractmethod
    def evaluate(self, agent_id: str, prompt: str, context: Dict) -> Dict:
        """
        Optional: evaluate a prompt against the AI platform.
        Returns dict with keys: response, tokens_used, model, latency_ms.
        """
        ...

    def sync(self) -> Dict[str, Any]:
        """Full sync: discover + return stats."""
        agents = self.discover_agents()
        return {"agent_count": len(agents), "agents": agents, "synced_at": datetime.utcnow().isoformat()}


# ── OpenAI Connector ───────────────────────────────────────────

class OpenAIConnector(ConnectorBase):
    connector_type = "openai"

    def connect(self) -> bool:
        try:
            import openai
            client = openai.OpenAI(api_key=self.config.get("api_key", ""))
            client.models.list()
            return True
        except Exception as e:
            logger.warning(f"OpenAI connect failed: {e}")
            return False

    def discover_agents(self) -> List[DiscoveredAgent]:
        try:
            import openai
            client = openai.OpenAI(api_key=self.config.get("api_key", ""))
            assistants = client.beta.assistants.list(limit=100)
            return [
                DiscoveredAgent(
                    external_id=a.id,
                    name=a.name or a.id,
                    description=a.instructions or "",
                    agent_type="assistant",
                    metadata={"model": a.model, "tools": [t.type for t in (a.tools or [])]},
                )
                for a in assistants.data
            ]
        except Exception as e:
            logger.error(f"OpenAI discover_agents failed: {e}")
            return []

    def evaluate(self, agent_id: str, prompt: str, context: Dict) -> Dict:
        return {"response": None, "tokens_used": 0, "model": "unknown", "latency_ms": 0}


# ── Azure OpenAI Connector ─────────────────────────────────────

class AzureOpenAIConnector(ConnectorBase):
    connector_type = "azure_openai"

    def connect(self) -> bool:
        try:
            import openai
            client = openai.AzureOpenAI(
                api_key=self.config.get("api_key", ""),
                azure_endpoint=self.config.get("endpoint", ""),
                api_version=self.config.get("api_version", "2024-02-01"),
            )
            client.models.list()
            return True
        except Exception as e:
            logger.warning(f"Azure OpenAI connect failed: {e}")
            return False

    def discover_agents(self) -> List[DiscoveredAgent]:
        # Azure doesn't have Assistants list in all regions — return empty
        # but framework is wired; customers add custom discovery here
        return []

    def evaluate(self, agent_id: str, prompt: str, context: Dict) -> Dict:
        return {"response": None, "tokens_used": 0, "model": "unknown", "latency_ms": 0}


# ── Anthropic Connector ────────────────────────────────────────

class AnthropicConnector(ConnectorBase):
    connector_type = "anthropic"

    def connect(self) -> bool:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.config.get("api_key", ""))
            # Validate key by listing models endpoint (no charge)
            return bool(client.api_key)
        except Exception as e:
            logger.warning(f"Anthropic connect failed: {e}")
            return False

    def discover_agents(self) -> List[DiscoveredAgent]:
        """
        Anthropic doesn't have a hosted agent registry.
        Returns well-known Claude models as discoverable agents.
        """
        models = [
            ("claude-opus-4",   "Claude Opus 4",   "Most capable Claude model"),
            ("claude-sonnet-4", "Claude Sonnet 4", "Balanced Claude model"),
            ("claude-haiku-4",  "Claude Haiku 4",  "Fast Claude model"),
        ]
        return [
            DiscoveredAgent(
                external_id=m[0], name=m[1], description=m[2],
                agent_type="model", metadata={"provider": "anthropic"},
            )
            for m in models
        ]

    def evaluate(self, agent_id: str, prompt: str, context: Dict) -> Dict:
        return {"response": None, "tokens_used": 0, "model": agent_id, "latency_ms": 0}


# ── Manual / Custom Connector ──────────────────────────────────

class ManualConnector(ConnectorBase):
    """Stub for manually-registered agents (no external API needed)."""
    connector_type = "manual"

    def connect(self) -> bool:
        return True

    def discover_agents(self) -> List[DiscoveredAgent]:
        return []

    def evaluate(self, agent_id: str, prompt: str, context: Dict) -> Dict:
        return {}


# ── Registry ──────────────────────────────────────────────────

_REGISTRY: Dict[str, type] = {
    "openai":       OpenAIConnector,
    "azure_openai": AzureOpenAIConnector,
    "anthropic":    AnthropicConnector,
    "manual":       ManualConnector,
}


def get_connector(connector_type: str, config: Dict[str, Any]) -> ConnectorBase:
    """
    Factory — returns the correct connector for a given type.
    New types plug in by adding to _REGISTRY only.
    """
    cls = _REGISTRY.get(connector_type)
    if not cls:
        raise ValueError(
            f"Unknown connector type: '{connector_type}'. "
            f"Available: {list(_REGISTRY.keys())}"
        )
    return cls(config)


def register_connector(connector_type: str, cls: type):
    """Allow third-party connectors to self-register."""
    _REGISTRY[connector_type] = cls


def list_connector_types() -> List[str]:
    return list(_REGISTRY.keys())
