import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "AI-SecOS"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # Database
    postgres_user: str = os.getenv("POSTGRES_USER", "secos_user")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "")
    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", 5432))
    postgres_db: str = os.getenv("POSTGRES_DB", "ai_secos_db")

    # Neo4j
    neo4j_auth: str = os.getenv("NEO4J_AUTH", "neo4j/password")
    neo4j_host: str = os.getenv("NEO4J_HOST", "localhost")
    neo4j_port: int = int(os.getenv("NEO4J_PORT", 7687))

    # JWT
    secret_key: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expiration_hours: int = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

    # API
    api_prefix: str = "/api/v1"

    @property
    def database_url(self) -> str:
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    @property
    def neo4j_uri(self) -> str:
        user, password = self.neo4j_auth.split("/")
        return f"bolt://{self.neo4j_host}:{self.neo4j_port}"

    @property
    def neo4j_credentials(self) -> tuple:
        user, password = self.neo4j_auth.split("/")
        return user, password

    class Config:
        env_file = ".env"


settings = Settings()
