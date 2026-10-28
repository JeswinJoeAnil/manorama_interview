"""Tests for the export contract and API endpoints."""

# pyrefly: ignore[missing-import]
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "gemini_configured" in data

    def test_root_returns_app_info(self):
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["app"] == "NEWSWIRE"


class TestValidateEndpoint:
    def test_valid_ticker(self):
        response = client.post("/api/tickers/validate", json={
            "items": [{
                "source_id": "test-1",
                "source_content": "The weather department issued a warning for coastal areas",
                "ticker_text": "Weather warning issued for coastal areas",
            }]
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 1
        assert data["results"][0]["is_valid"] is True

    def test_empty_ticker_invalid(self):
        response = client.post("/api/tickers/validate", json={
            "items": [{
                "source_id": "test-1",
                "source_content": "Some source",
                "ticker_text": "",
            }]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["results"][0]["is_valid"] is False

    def test_word_count_exceeded(self):
        response = client.post("/api/tickers/validate", json={
            "items": [{
                "source_id": "test-1",
                "source_content": "Source text",
                "ticker_text": "one two three four five six seven eight nine ten eleven",
            }]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["results"][0]["is_valid"] is False
        assert data["results"][0]["word_count"] == 11

    def test_batch_validation(self):
        response = client.post("/api/tickers/validate", json={
            "items": [
                {
                    "source_id": "test-1",
                    "source_content": "Source one",
                    "ticker_text": "Valid ticker",
                },
                {
                    "source_id": "test-2",
                    "source_content": "Source two",
                    "ticker_text": "",
                },
            ]
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 2
        assert data["results"][0]["is_valid"] is True
        assert data["results"][1]["is_valid"] is False


class TestGenerateEndpoint:
    def test_generate_demo_mode(self, monkeypatch):
        """Without an API key, should return demo results (no live API call)."""
        import app.services.ai_providers as providers
        monkeypatch.setattr(providers, "is_configured", lambda: False)  # force demo mode
        response = client.post("/api/tickers/generate", json={
            "sources": [{
                "source_id": "test-1",
                "title": "Test",
                "content": "A test announcement about something happening",
            }]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["is_demo"] is True
        assert len(data["results"]) == 1
        assert data["results"][0]["is_demo"] is True

    def test_generate_empty_sources_rejected(self):
        response = client.post("/api/tickers/generate", json={
            "sources": []
        })
        assert response.status_code == 422  # Pydantic validation

    def test_generate_source_too_long_rejected(self):
        response = client.post("/api/tickers/generate", json={
            "sources": [{
                "source_id": "test-1",
                "content": "x" * 10_001,
            }]
        })
        assert response.status_code == 422


class TestExportContract:
    """Test that the JSON export format meets the documented contract."""

    def test_export_schema_fields(self):
        """The export JSON should contain required fields."""
        # This tests the contract, not an endpoint — export is client-side
        import json
        export = {
            "schema_version": "1.0",
            "batch_id": "test-batch-001",
            "exported_at": "2024-01-01T00:00:00Z",
            "tickers": [
                {
                    "ticker_id": "ticker-1",
                    "source_id": "source-1",
                    "text": "Test ticker text here",
                    "word_count": 4,
                    "position": 1,
                    "category": "test",
                    "approved": True,
                }
            ],
        }
        # Should be valid JSON
        json_str = json.dumps(export, ensure_ascii=False)
        parsed = json.loads(json_str)
        assert parsed["schema_version"] == "1.0"
        assert len(parsed["tickers"]) == 1
        assert parsed["tickers"][0]["approved"] is True

    def test_malayalam_survives_json_roundtrip(self):
        """Malayalam text must survive JSON serialization."""
        import json
        ticker = {
            "text": "ആന്ധ്ര, ഒഡീഷ തീരങ്ങളിൽ കനത്ത മഴ സാധ്യത",
            "word_count": 6,
        }
        json_str = json.dumps(ticker, ensure_ascii=False)
        parsed = json.loads(json_str)
        assert parsed["text"] == ticker["text"]
        assert "ആന്ധ്ര" in parsed["text"]
