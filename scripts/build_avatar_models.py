#!/usr/bin/env python3
"""Generate the GLB base avatars used by the Avatar Studio.

The models are deliberately simple, parametric mannequins — not scans and not
photoreal humans. Each file contains named nodes so the Three.js client can
apply measurement-based and manual adjustments at runtime:

    body_torso · body_head · body_neck · arm_left · arm_right
    leg_left · leg_right · hair

All geometry is authored in metres, standing on Y=0, facing +Z. Regenerate with:

    python scripts/build_avatar_models.py

The output is committed under ``frontend/public/models`` so the app has no
runtime dependency on this script or on any external asset host.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import numpy as np

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "frontend" / "public" / "models"

SKIN_MATERIAL = 0
HAIR_MATERIAL = 1


# --------------------------------------------------------------------------
# geometry helpers (arrays of float32 / uint32)
# --------------------------------------------------------------------------
def ellipsoid(
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    rings: int = 16,
    segments: int = 24,
    phi_max: float = math.pi,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """UV sphere (optionally a cap) with outward normals."""
    cx, cy, cz = center
    rx, ry, rz = radii
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []

    for ring in range(rings + 1):
        phi = phi_max * ring / rings
        for segment in range(segments + 1):
            theta = 2 * math.pi * segment / segments
            x = math.sin(phi) * math.cos(theta)
            y = math.cos(phi)
            z = math.sin(phi) * math.sin(theta)
            positions.append([cx + rx * x, cy + ry * y, cz + rz * z])
            nx, ny, nz = x / rx, y / ry, z / rz
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            normals.append([nx / length, ny / length, nz / length])

    row = segments + 1
    for ring in range(rings):
        for segment in range(segments):
            a = ring * row + segment
            b = a + row
            indices.extend([a, b, a + 1, a + 1, b, b + 1])

    return np.array(positions, dtype=np.float32), np.array(normals, dtype=np.float32), np.array(indices, dtype=np.uint32)


def tube(
    rings: list[tuple[float, float, float]],
    segments: int = 24,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tapered elliptical tube.

    ``rings`` is a list of (y, radius_x, radius_z) from top to bottom. Open ends
    are capped with a small fan so the model looks solid from every angle.
    """
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []

    for y, rx, rz in rings:
        for segment in range(segments + 1):
            theta = 2 * math.pi * segment / segments
            x = rx * math.cos(theta)
            z = rz * math.sin(theta)
            positions.append([x, y, z])
            nx, nz = x / (rx * rx), z / (rz * rz)
            length = math.sqrt(nx * nx + nz * nz) or 1.0
            normals.append([nx / length, 0.0, nz / length])

    row = segments + 1
    for index in range(len(rings) - 1):
        for segment in range(segments):
            a = index * row + segment
            b = a + row
            indices.extend([a, b, a + 1, a + 1, b, b + 1])

    # caps
    top_y, top_rx, top_rz = rings[0]
    bottom_y, bottom_rx, bottom_rz = rings[-1]
    for cap_y, rx, rz, normal_y in ((top_y, top_rx, top_rz, 1.0), (bottom_y, bottom_rx, bottom_rz, -1.0)):
        center_index = len(positions)
        positions.append([0.0, cap_y, 0.0])
        normals.append([0.0, normal_y, 0.0])
        first = len(positions)
        for segment in range(segments + 1):
            theta = 2 * math.pi * segment / segments
            positions.append([rx * math.cos(theta), cap_y, rz * math.sin(theta)])
            normals.append([0.0, normal_y, 0.0])
        for segment in range(segments):
            if normal_y > 0:
                indices.extend([center_index, first + segment + 1, first + segment])
            else:
                indices.extend([center_index, first + segment, first + segment + 1])

    return np.array(positions, dtype=np.float32), np.array(normals, dtype=np.float32), np.array(indices, dtype=np.uint32)


# --------------------------------------------------------------------------
# body definitions
# --------------------------------------------------------------------------
BASE_MODELS: dict[str, dict] = {
    "willow": {
        "label": "Willow",
        "presentation": "feminine",
        "shoulder": 0.190,
        "chest": 0.165,
        "waist": 0.128,
        "hip": 0.176,
        "limb": 1.0,
        "hair": "bun",
    },
    "atlas": {
        "label": "Atlas",
        "presentation": "masculine",
        "shoulder": 0.222,
        "chest": 0.178,
        "waist": 0.150,
        "hip": 0.162,
        "limb": 1.06,
        "hair": "short",
    },
    "line": {
        "label": "Line",
        "presentation": "neutral",
        "shoulder": 0.196,
        "chest": 0.160,
        "waist": 0.140,
        "hip": 0.158,
        "limb": 1.0,
        "hair": "short",
    },
    "curve": {
        "label": "Curve",
        "presentation": "feminine",
        "shoulder": 0.200,
        "chest": 0.172,
        "waist": 0.140,
        "hip": 0.198,
        "limb": 1.02,
        "hair": "long",
    },
}


def build_parts(spec: dict) -> list[dict]:
    """Return node definitions: name, translation, rotation, geometry, material."""
    shoulder_w = spec["shoulder"]
    chest_w = spec["chest"]
    waist_w = spec["waist"]
    hip_w = spec["hip"]
    limb = spec["limb"]

    hip_y = 0.92
    shoulder_y = 1.43
    neck_top = 1.52
    head_center = 1.615

    torso_pos, torso_nrm, torso_idx = tube(
        [
            (shoulder_y, shoulder_w, shoulder_w * 0.52),
            (shoulder_y - 0.10, chest_w, chest_w * 0.60),
            (1.14, waist_w, waist_w * 0.62),
            (1.02, hip_w * 0.96, hip_w * 0.64),
            (hip_y, hip_w, hip_w * 0.66),
        ]
    )

    neck_pos, neck_nrm, neck_idx = tube(
        [(neck_top, 0.052, 0.048), (1.44, 0.058, 0.052)]
    )

    head_pos, head_nrm, head_idx = ellipsoid((0, head_center, 0), (0.086, 0.104, 0.092), rings=18, segments=26)

    arm_rings = [
        (0.0, 0.050 * limb, 0.050 * limb),
        (-0.16, 0.045 * limb, 0.045 * limb),
        (-0.34, 0.038 * limb, 0.038 * limb),
        (-0.52, 0.031 * limb, 0.031 * limb),
        (-0.62, 0.026 * limb, 0.026 * limb),
    ]
    arm_pos, arm_nrm, arm_idx = tube(arm_rings)

    leg_rings = [
        (0.0, 0.080 * limb, 0.082 * limb),
        (-0.20, 0.070 * limb, 0.072 * limb),
        (-0.46, 0.055 * limb, 0.058 * limb),
        (-0.72, 0.042 * limb, 0.044 * limb),
        (-0.86, 0.036 * limb, 0.038 * limb),
    ]
    leg_pos, leg_nrm, leg_idx = tube(leg_rings, segments=20)

    hair_style = spec["hair"]
    if hair_style == "bun":
        hair_pos, hair_nrm, hair_idx = ellipsoid((0, 1.635, -0.004), (0.092, 0.086, 0.098), rings=12, segments=22, phi_max=math.pi * 0.55)
        bun_pos, bun_nrm, bun_idx = ellipsoid((0, 1.63, -0.088), (0.042, 0.042, 0.042), rings=8, segments=14)
        hair_pos = np.vstack([hair_pos, bun_pos])
        hair_nrm = np.vstack([hair_nrm, bun_nrm])
        hair_idx = np.concatenate([hair_idx, bun_idx + len(hair_pos) - len(bun_pos)])
    elif hair_style == "long":
        cap_pos, cap_nrm, cap_idx = ellipsoid((0, 1.632, -0.004), (0.096, 0.092, 0.104), rings=12, segments=22, phi_max=math.pi * 0.58)
        fall_pos, fall_nrm, fall_idx = tube([(1.60, 0.098, 0.050), (1.44, 0.104, 0.052), (1.30, 0.086, 0.044)])
        hair_pos = np.vstack([cap_pos, fall_pos])
        hair_nrm = np.vstack([cap_nrm, fall_nrm])
        hair_idx = np.concatenate([cap_idx, fall_idx + len(cap_pos)])
    else:
        hair_pos, hair_nrm, hair_idx = ellipsoid((0, 1.638, -0.002), (0.090, 0.080, 0.096), rings=10, segments=20, phi_max=math.pi * 0.5)

    tilt = math.radians(9)
    return [
        {
            "name": "body_torso",
            "translation": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (torso_pos, torso_nrm, torso_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "body_neck",
            "translation": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (neck_pos, neck_nrm, neck_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "body_head",
            "translation": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (head_pos, head_nrm, head_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "arm_left",
            "translation": [shoulder_w * 0.86, shoulder_y - 0.02, 0.0],
            "rotation": [0.0, 0.0, tilt],
            "geometry": (arm_pos, arm_nrm, arm_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "arm_right",
            "translation": [-shoulder_w * 0.86, shoulder_y - 0.02, 0.0],
            "rotation": [0.0, 0.0, -tilt],
            "geometry": (arm_pos, arm_nrm, arm_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "leg_left",
            "translation": [hip_w * 0.45, hip_y - 0.02, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (leg_pos, leg_nrm, leg_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "leg_right",
            "translation": [-hip_w * 0.45, hip_y - 0.02, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (leg_pos, leg_nrm, leg_idx),
            "material": SKIN_MATERIAL,
        },
        {
            "name": "hair",
            "translation": [0.0, 0.0, 0.0],
            "rotation": [0.0, 0.0, 0.0],
            "geometry": (hair_pos, hair_nrm, hair_idx),
            "material": HAIR_MATERIAL,
        },
    ]


# --------------------------------------------------------------------------
# GLB writer
# --------------------------------------------------------------------------
def _align(data: bytes, fill: bytes = b"\x00") -> bytes:
    padding = (-len(data)) % 4
    return data + fill * padding


def build_glb(spec: dict) -> bytes:
    parts = build_parts(spec)

    buffer = bytearray()
    buffer_views: list[dict] = []
    accessors: list[dict] = []
    meshes: list[dict] = []
    nodes: list[dict] = []

    def add_view(payload: bytes, target: int) -> int:
        buffer.extend(_align(payload))
        buffer_views.append(
            {
                "buffer": 0,
                "byteOffset": len(buffer) - len(_align(payload)),
                "byteLength": len(payload),
                "target": target,
            }
        )
        return len(buffer_views) - 1

    for part in parts:
        positions, normals, indices = part["geometry"]
        pos_view = add_view(positions.tobytes(), 34962)
        nrm_view = add_view(normals.tobytes(), 34962)
        idx_view = add_view(indices.tobytes(), 34963)

        accessors.append(
            {
                "bufferView": pos_view,
                "componentType": 5126,
                "count": int(len(positions)),
                "type": "VEC3",
                "min": positions.min(axis=0).round(5).tolist(),
                "max": positions.max(axis=0).round(5).tolist(),
            }
        )
        pos_accessor = len(accessors) - 1
        accessors.append(
            {
                "bufferView": nrm_view,
                "componentType": 5126,
                "count": int(len(normals)),
                "type": "VEC3",
            }
        )
        nrm_accessor = len(accessors) - 1
        accessors.append(
            {
                "bufferView": idx_view,
                "componentType": 5125,
                "count": int(len(indices)),
                "type": "SCALAR",
            }
        )
        idx_accessor = len(accessors) - 1

        meshes.append(
            {
                "name": f"{part['name']}_mesh",
                "primitives": [
                    {
                        "attributes": {"POSITION": pos_accessor, "NORMAL": nrm_accessor},
                        "indices": idx_accessor,
                        "material": part["material"],
                    }
                ],
            }
        )
        nodes.append(
            {
                "name": part["name"],
                "mesh": len(meshes) - 1,
                "translation": [round(value, 5) for value in part["translation"]],
                "rotation": [round(value, 6) for value in part["rotation"]],
            }
        )

    gltf = {
        "asset": {"version": "2.0", "generator": "AI Fashion Studio avatar builder"},
        "scene": 0,
        "scenes": [{"name": spec["label"], "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": [
            {
                "name": "Skin",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.788, 0.604, 0.463, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.86,
                },
                "doubleSided": True,
            },
            {
                "name": "Hair",
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.141, 0.11, 0.094, 1.0],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.72,
                },
                "doubleSided": True,
            },
        ],
        "buffers": [{"byteLength": len(_align(bytes(buffer)))}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }

    json_chunk = _align(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = _align(bytes(buffer))

    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    glb = bytearray()
    glb += struct.pack("<III", 0x46546C67, 2, total)
    glb += struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    glb += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
    return bytes(glb)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for slug, spec in BASE_MODELS.items():
        payload = build_glb(spec)
        target = OUTPUT_DIR / f"avatar-{slug}.glb"
        target.write_bytes(payload)
        manifest.append({"id": slug, "label": spec["label"], "file": target.name, "bytes": len(payload)})
        print(f"wrote {target.relative_to(OUTPUT_DIR.parents[2])}  ({len(payload) / 1024:.1f} kB)")

    (OUTPUT_DIR / "avatar-models.json").write_text(
        json.dumps({"models": manifest}, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
