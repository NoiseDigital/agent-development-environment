import pytest
from httpx import ASGITransport, AsyncClient
from server import app


@pytest.fixture(scope="module")
async def client():
    """Provides an async test client for the FastAPI app."""
    async with ASGITransport(app=app) as transport:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


@pytest.mark.anyio
async def test_get_tasks_default(client: AsyncClient):
    """Test the /get_tasks endpoint with default parameters."""
    response = await client.post("/get_tasks")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)
    assert len(data["data"]) == 3
    assert data["data"][0]["name"] == "Prepare project report [P002-EPSON]"
    assert data["completed_since"] == "now"
    assert data["project_id"] == ""


@pytest.mark.anyio
async def test_get_tasks_with_params(client: AsyncClient):
    """Test the /get_tasks endpoint with specific parameters."""
    test_project_id = "TEST-PROJ-123"
    test_completed_since = "2024-01-01"
    response = await client.post(
        "/get_tasks",
        params={"project_id": test_project_id, "completed_since": test_completed_since},
    )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert data["project_id"] == test_project_id
    assert data["completed_since"] == test_completed_since
    assert data["data"][0]["project_id"] == test_project_id


@pytest.mark.anyio
async def test_get_tasks_wrong_method(client: AsyncClient):
    """Test that a GET request to /get_tasks fails."""
    response = await client.get("/get_tasks")
    assert response.status_code == 405  # Method Not Allowed
