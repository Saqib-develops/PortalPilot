import json
from pathlib import Path
from pydantic import BaseModel

class PortalEntryPoint(BaseModel):
    name: str
    url: str

class PortalDefinition(BaseModel):
    id: str
    name: str
    state: str
    url: str
    allowed_hosts: list[str]
    description: str
    category: str
    entry_points: list[PortalEntryPoint]
    sensitive_actions: list[str]

class PortalRegistry:
    def __init__(self, registry_file: Path | None = None):
        if registry_file is None:
            registry_file = Path(__file__).parent / "portals.json"
        self.registry_file = registry_file
        self.portals: dict[str, PortalDefinition] = {}
        self.reload()

    def reload(self) -> None:
        if not self.registry_file.exists():
            self.portals = {}
            return
        content = self.registry_file.read_text(encoding="utf-8")
        data = json.loads(content)
        self.portals = {
            item["id"]: PortalDefinition.model_validate(item)
            for item in data
        }

    def list_portals(self) -> list[PortalDefinition]:
        return list(self.portals.values())

    def get_portal(self, portal_id: str) -> PortalDefinition | None:
        return self.portals.get(portal_id)

    def get_all_allowed_hosts(self) -> set[str]:
        hosts = set()
        for portal in self.portals.values():
            hosts.update(portal.allowed_hosts)
        return hosts

registry = PortalRegistry()
