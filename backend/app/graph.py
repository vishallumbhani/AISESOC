from neo4j import GraphDatabase
from app.config import settings
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class Neo4jGraph:
    """Neo4j graph database handler."""

    def __init__(self):
        user, password = settings.neo4j_credentials
        self.driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(user, password),
            encrypted=False
        )

    def close(self):
        """Close the driver connection."""
        if self.driver:
            self.driver.close()

    def execute(self, query: str, parameters: Dict[str, Any] = None):
        """Execute a Cypher query."""
        with self.driver.session() as session:
            return session.run(query, parameters or {})

    def create_asset_node(self, asset_id: str, asset_name: str, asset_type: str) -> bool:
        """Create an asset node in the graph."""
        try:
            query = """
            CREATE (a:Asset {
                id: $asset_id,
                name: $asset_name,
                type: $asset_type,
                created_at: timestamp()
            })
            RETURN a
            """
            result = self.execute(query, {
                "asset_id": asset_id,
                "asset_name": asset_name,
                "asset_type": asset_type
            })
            return True
        except Exception as e:
            logger.error(f"Error creating asset node: {e}")
            return False

    def create_agent_node(self, agent_id: str, agent_name: str, agent_type: str) -> bool:
        """Create an agent node in the graph."""
        try:
            query = """
            CREATE (a:Agent {
                id: $agent_id,
                name: $agent_name,
                type: $agent_type,
                created_at: timestamp()
            })
            RETURN a
            """
            result = self.execute(query, {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "agent_type": agent_type
            })
            return True
        except Exception as e:
            logger.error(f"Error creating agent node: {e}")
            return False

    def create_tool_node(self, tool_id: str, tool_name: str) -> bool:
        """Create a tool node in the graph."""
        try:
            query = """
            CREATE (t:Tool {
                id: $tool_id,
                name: $tool_name,
                created_at: timestamp()
            })
            RETURN t
            """
            result = self.execute(query, {
                "tool_id": tool_id,
                "tool_name": tool_name
            })
            return True
        except Exception as e:
            logger.error(f"Error creating tool node: {e}")
            return False

    def create_data_source_node(self, source_id: str, source_name: str, source_type: str) -> bool:
        """Create a data source node in the graph."""
        try:
            query = """
            CREATE (d:DataSource {
                id: $source_id,
                name: $source_name,
                type: $source_type,
                created_at: timestamp()
            })
            RETURN d
            """
            result = self.execute(query, {
                "source_id": source_id,
                "source_name": source_name,
                "source_type": source_type
            })
            return True
        except Exception as e:
            logger.error(f"Error creating data source node: {e}")
            return False

    def create_relationship(self, from_id: str, to_id: str, relationship_type: str, from_type: str = "Agent", to_type: str = "Asset") -> bool:
        """Create a relationship between two nodes."""
        try:
            query = f"""
            MATCH (from:{from_type} {{id: $from_id}})
            MATCH (to:{to_type} {{id: $to_id}})
            CREATE (from)-[:{relationship_type}]->(to)
            RETURN from, to
            """
            result = self.execute(query, {
                "from_id": from_id,
                "to_id": to_id
            })
            return True
        except Exception as e:
            logger.error(f"Error creating relationship: {e}")
            return False

    def query_sensitive_data_access(self, organization_id: str) -> List[Dict[str, Any]]:
        """Query which agents can access sensitive data."""
        try:
            query = """
            MATCH (a:Agent)-[*]->(ds:DataSource {type: "database"})
            WHERE ds.sensitivity = "high"
            RETURN a.id as agent_id, a.name as agent_name, ds.id as source_id, ds.name as source_name
            """
            result = self.execute(query)
            records = []
            for record in result:
                records.append(dict(record))
            return records
        except Exception as e:
            logger.error(f"Error querying sensitive data access: {e}")
            return []

    def get_graph_paths(self, from_id: str, to_id: str) -> List[List[str]]:
        """Get all paths between two nodes."""
        try:
            query = """
            MATCH path = (from {id: $from_id})-[*]->(to {id: $to_id})
            RETURN path
            """
            result = self.execute(query, {
                "from_id": from_id,
                "to_id": to_id
            })
            paths = []
            for record in result:
                paths.append([node.get('name', node.get('id')) for node in record[0].nodes])
            return paths
        except Exception as e:
            logger.error(f"Error getting graph paths: {e}")
            return []


# Global Neo4j instance
graph_db = None


def get_graph_db() -> Neo4jGraph:
    """Get or create the Neo4j graph database instance."""
    global graph_db
    if graph_db is None:
        graph_db = Neo4jGraph()
    return graph_db


def close_graph_db():
    """Close the Neo4j graph database connection."""
    global graph_db
    if graph_db:
        graph_db.close()
        graph_db = None
