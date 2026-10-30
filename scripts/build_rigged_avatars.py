#!/usr/bin/env python3
"""Build the rigged GLB avatars and sample wardrobe used by the fitting room.

Unlike ``build_avatar_models.py`` (static, segmented mannequins for the avatar
studio cards), the models written here are **skinned** humanoids with a shared
19-bone skeleton and three authored clips: ``idle``, ``walk`` and ``turn``.

Each file also contains a small, deliberately fitted sample wardrobe. Every
garment mesh is skinned to the same skeleton, so it follows the body exactly
during animation — there is no runtime auto-fitting or cloth simulation. The
client maps catalogue slots onto these authored silhouettes and states the
fidelity level in the UI.

Layout (metres, feet on Y=0, facing +Z):

    Armature (root)
      hips · spine · chest · neck · head
        shoulder_L/R · upper_arm_L/R · forearm_L/R · hand_L/R
        thigh_L/R · shin_L/R · foot_L/R

Run from the repository root:

    python scripts/build_rigged_avatars.py

The generated binaries are committed under
``frontend/public/models/rig/`` so the running app never depends on this
script or on an external asset host.
"""

from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "models" / "rig"

FPS = 24
MAX_INFLUENCES = 4


# ---------------------------------------------------------------------------
# maths helpers
# ---------------------------------------------------------------------------
def rot_x(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)


def rot_y(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)


def rot_z(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)


def quat_from_axis(axis: str, angle: float) -> np.ndarray:
    half = angle * 0.5
    s = math.sin(half)
    if axis == "x":
        return np.array([s, 0.0, 0.0, math.cos(half)])
    if axis == "y":
        return np.array([0.0, s, 0.0, math.cos(half)])
    return np.array([0.0, 0.0, s, math.cos(half)])


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return np.array(
        [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ]
    )


def quat_to_matrix(q: np.ndarray) -> np.ndarray:
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if n == 0:
        return np.eye(3)
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ],
        dtype=np.float64,
    )


def transformation(translation, quaternion) -> np.ndarray:
    matrix = np.eye(4)
    matrix[:3, :3] = quat_to_matrix(np.asarray(quaternion, dtype=np.float64))
    matrix[:3, 3] = np.asarray(translation, dtype=np.float64)
    return matrix


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return min(high, max(low, value))


def smoothstep(t: float) -> float:
    t = clamp(t)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------
@dataclass
class MeshPart:
    name: str
    material: str
    positions: np.ndarray
    normals: np.ndarray
    indices: np.ndarray
    bones: list[dict[str, float]] = field(default_factory=list)


def ellipsoid(
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    rings: int = 14,
    segments: int = 20,
    phi_max: float = math.pi,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
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
    return (
        np.array(positions, dtype=np.float32),
        np.array(normals, dtype=np.float32),
        np.array(indices, dtype=np.uint32),
    )


def tube(
    rings: list[tuple[float, float, float]],
    segments: int = 20,
    cap: bool = True,
    start_angle: float = 0.0,
    end_angle: float = math.tau,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tapered elliptical tube; rings are (y, radius_x, radius_z) top to bottom.

    ``start_angle``/``end_angle`` allow an open-front shell (a waistcoat) while
    keeping the same vertex layout. Caps are only generated for full circles.
    """
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []
    full = abs((end_angle - start_angle) - math.tau) < 1e-6

    for y, rx, rz in rings:
        for segment in range(segments + 1):
            theta = start_angle + (end_angle - start_angle) * segment / segments
            x = rx * math.cos(theta)
            z = rz * math.sin(theta)
            positions.append([x, y, z])
            nx, nz = x / max(rx * rx, 1e-8), z / max(rz * rz, 1e-8)
            length = math.sqrt(nx * nx + nz * nz) or 1.0
            normals.append([nx / length, 0.0, nz / length])

    row = segments + 1
    for index in range(len(rings) - 1):
        for segment in range(segments):
            a = index * row + segment
            b = a + row
            indices.extend([a, b, a + 1, a + 1, b, b + 1])

    if cap and full:
        for cap_y, rx, rz, normal_y in ((rings[0][0], rings[0][1], rings[0][2], 1.0), (rings[-1][0], rings[-1][1], rings[-1][2], -1.0)):
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

    return (
        np.array(positions, dtype=np.float32),
        np.array(normals, dtype=np.float32),
        np.array(indices, dtype=np.uint32),
    )


def strip(
    path: list[tuple[float, float, float]],
    width: float,
    axis: tuple[float, float, float] = (1.0, 0.0, 0.0),
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Ribbon following a 3D path, used for the dupatta drape.

    The ribbon width runs along a fixed horizontal axis so a drape that moves
    toward the camera stays visible instead of turning edge-on.
    """
    points = np.array(path, dtype=np.float64)
    positions: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []
    side = np.array(axis, dtype=np.float64)
    side /= np.linalg.norm(side) or 1.0
    for index, point in enumerate(points):
        # Ribbons hang across the body, so the width axis is horizontal.
        for sign in (-1.0, 1.0):
            offset = side * (width * 0.5 * sign)
            positions.append([point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]])
            normals.append([0.0, 0.0, 1.0])
    for index in range(len(points) - 1):
        a = index * 2
        indices.extend([a, a + 2, a + 1, a + 1, a + 2, a + 3])
    return (
        np.array(positions, dtype=np.float32),
        np.array(normals, dtype=np.float32),
        np.array(indices, dtype=np.uint32),
    )


def transform_geometry(
    positions: np.ndarray,
    normals: np.ndarray,
    rotation: np.ndarray,
    translation: tuple[float, float, float],
) -> tuple[np.ndarray, np.ndarray]:
    moved = positions @ rotation.T + np.array(translation, dtype=np.float64)
    turned = normals @ rotation.T
    return moved.astype(np.float32), turned.astype(np.float32)


def resample_path(path: list[tuple[float, float, float]], count: int = 18) -> list[tuple[float, float, float]]:
    points = np.array(path, dtype=np.float64)
    lengths = np.linalg.norm(np.diff(points, axis=0), axis=1)
    cumulative = np.concatenate([[0.0], np.cumsum(lengths)])
    total = cumulative[-1] or 1.0
    samples = []
    for step in range(count):
        target = total * step / (count - 1)
        index = int(np.searchsorted(cumulative, target, side="right") - 1)
        index = min(index, len(points) - 2)
        span = cumulative[index + 1] - cumulative[index] or 1.0
        t = (target - cumulative[index]) / span
        point = points[index] * (1 - t) + points[index + 1] * t
        samples.append(tuple(float(value) for value in point))
    return samples


# ---------------------------------------------------------------------------
# body + wardrobe specifications
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class RigSpec:
    slug: str
    label: str
    presentation: str
    shoulder: float
    chest: float
    waist: float
    hip: float
    limb: float
    hair: str
    top_length: float
    bottom_baggy: float


RIGS: list[RigSpec] = [
    RigSpec(
        slug="female",
        label="Atelier female",
        presentation="feminine",
        shoulder=0.190,
        chest=0.165,
        waist=0.128,
        hip=0.176,
        limb=1.0,
        hair="bun",
        top_length=0.78,
        bottom_baggy=0.030,
    ),
    RigSpec(
        slug="male",
        label="Atelier male",
        presentation="masculine",
        shoulder=0.222,
        chest=0.178,
        waist=0.150,
        hip=0.162,
        limb=1.06,
        hair="short",
        top_length=0.84,
        bottom_baggy=0.004,
    ),
]

HIP_Y = 0.92
SHOULDER_Y = 1.43
ARM_LENGTH = 0.62
LEG_LENGTH = 0.86
ARM_TILT = math.radians(9)


BONE_ORDER = [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "shoulder_L",
    "upper_arm_L",
    "forearm_L",
    "hand_L",
    "shoulder_R",
    "upper_arm_R",
    "forearm_R",
    "hand_R",
    "thigh_L",
    "shin_L",
    "foot_L",
    "thigh_R",
    "shin_R",
    "foot_R",
]


def build_bones(spec: RigSpec) -> list[dict]:
    sw, hip = spec.shoulder, spec.hip
    bones: list[dict] = []

    def add(name: str, parent: str | None, translation, rest=(0.0, 0.0, 0.0, 1.0)):
        bones.append(
            {
                "name": name,
                "parent": parent,
                "translation": [round(float(value), 6) for value in translation],
                "rotation": [round(float(value), 8) for value in rest],
            }
        )

    add("hips", None, (0.0, HIP_Y, 0.0))
    add("spine", "hips", (0.0, 0.10, 0.0))
    add("chest", "spine", (0.0, 0.20, 0.0))
    add("neck", "chest", (0.0, 0.20, 0.0))
    add("head", "neck", (0.0, 0.10, 0.0))

    for side, sign in (("L", 1.0), ("R", -1.0)):
        tilt = quat_from_axis("z", ARM_TILT * sign)
        add(f"shoulder_{side}", "chest", (sign * sw * 0.55, 0.18, 0.0))
        add(f"upper_arm_{side}", f"shoulder_{side}", (sign * sw * 0.31, -0.01, 0.0), tilt)
        add(f"forearm_{side}", f"upper_arm_{side}", (0.0, -0.30, 0.0))
        add(f"hand_{side}", f"forearm_{side}", (0.0, -0.30, 0.0))
        add(f"thigh_{side}", "hips", (sign * hip * 0.45, -0.02, 0.0))
        add(f"shin_{side}", f"thigh_{side}", (0.0, -0.44, 0.0))
        add(f"foot_{side}", f"shin_{side}", (0.0, -0.40, 0.0))

    return bones


def rest_rotations(bones: list[dict]) -> dict[str, np.ndarray]:
    return {bone["name"]: np.array(bone["rotation"], dtype=np.float64) for bone in bones}


def _weights(*entries: tuple[str, float]) -> dict[str, float]:
    total = sum(weight for _, weight in entries) or 1.0
    merged: dict[str, float] = {}
    for name, weight in entries:
        if weight <= 0:
            continue
        merged[name] = merged.get(name, 0.0) + weight / total
    ordered = sorted(merged.items(), key=lambda item: -item[1])[:MAX_INFLUENCES]
    total = sum(weight for _, weight in ordered) or 1.0
    return {name: weight / total for name, weight in ordered}


def torso_weights(y: float) -> dict[str, float]:
    if y <= 1.00:
        return _weights(("hips", 1.0))
    if y < 1.11:
        t = smoothstep((y - 1.00) / 0.11)
        return _weights(("hips", 1 - t), ("spine", t))
    if y < 1.24:
        return _weights(("spine", 1.0))
    if y < 1.33:
        t = smoothstep((y - 1.24) / 0.09)
        return _weights(("spine", 1 - t), ("chest", t))
    return _weights(("chest", 1.0))


def arm_weights(point: np.ndarray, side: str, spec: RigSpec) -> dict[str, float]:
    sign = 1.0 if side == "L" else -1.0
    pivot = np.array([sign * spec.shoulder * 0.86, 1.40, 0.0])
    local = rot_z(-ARM_TILT * sign) @ (point - pivot)
    t = clamp(-float(local[1]) / ARM_LENGTH)
    upper = f"upper_arm_{side}"
    fore = f"forearm_{side}"
    hand = f"hand_{side}"
    if t < 0.44:
        return _weights((upper, 1.0))
    if t < 0.55:
        k = smoothstep((t - 0.44) / 0.11)
        return _weights((upper, 1 - k), (fore, k))
    if t < 0.92:
        return _weights((fore, 1.0))
    k = smoothstep((t - 0.92) / 0.08)
    return _weights((fore, 1 - k), (hand, k))


def leg_weights(point: np.ndarray, side: str, spec: RigSpec) -> dict[str, float]:
    t = clamp((HIP_Y - 0.02 - float(point[1])) / LEG_LENGTH)
    thigh = f"thigh_{side}"
    shin = f"shin_{side}"
    if t < 0.46:
        return _weights((thigh, 1.0))
    if t < 0.56:
        k = smoothstep((t - 0.46) / 0.10)
        return _weights((thigh, 1 - k), (shin, k))
    return _weights((shin, 1.0))


def leg_side(point: np.ndarray) -> str:
    return "L" if point[0] >= 0 else "R"


def bottom_weights(point: np.ndarray, spec: RigSpec) -> dict[str, float]:
    side = leg_side(point)
    y = float(point[1])
    if y > 0.90:
        return _weights(("hips", 1.0))
    if y > 0.80:
        k = smoothstep((0.90 - y) / 0.10)
        return _weights(("hips", 1 - k), (f"thigh_{side}", k))
    return leg_weights(point, side, spec)


def build_body_parts(spec: RigSpec) -> list[MeshPart]:
    sw, chest, waist, hip, limb = spec.shoulder, spec.chest, spec.waist, spec.hip, spec.limb
    parts: list[MeshPart] = []

    torso_pos, torso_nrm, torso_idx = tube(
        [
            (SHOULDER_Y, sw, sw * 0.52),
            (SHOULDER_Y - 0.10, chest, chest * 0.60),
            (1.14, waist, waist * 0.62),
            (1.02, hip * 0.96, hip * 0.64),
            (HIP_Y, hip, hip * 0.66),
        ],
        segments=24,
    )
    if spec.presentation == "feminine":
        # A subtle bust gives the female base model a distinct silhouette
        # without changing the shared skeleton or the fitted garments.
        for sign in (-1.0, 1.0):
            bust_pos, bust_nrm, bust_idx = ellipsoid(
                (sign * chest * 0.32, 1.285, chest * 0.46),
                (chest * 0.34, chest * 0.30, chest * 0.26),
                rings=8,
                segments=14,
            )
            torso_idx = np.concatenate([torso_idx, bust_idx + len(torso_pos)])
            torso_pos = np.vstack([torso_pos, bust_pos])
            torso_nrm = np.vstack([torso_nrm, bust_nrm])
    parts.append(
        MeshPart(
            "body_torso",
            "skin",
            torso_pos,
            torso_nrm,
            torso_idx,
            [torso_weights(float(point[1])) for point in torso_pos],
        )
    )

    neck_pos, neck_nrm, neck_idx = tube([(1.52, 0.052, 0.048), (1.44, 0.058, 0.052)], segments=18)
    parts.append(
        MeshPart(
            "body_neck",
            "skin",
            neck_pos,
            neck_nrm,
            neck_idx,
            [{"neck": 1.0} for _ in neck_pos],
        )
    )

    head_pos, head_nrm, head_idx = ellipsoid((0, 1.615, 0), (0.086, 0.104, 0.092), rings=18, segments=26)
    parts.append(
        MeshPart(
            "body_head",
            "skin",
            head_pos,
            head_nrm,
            head_idx,
            [{"head": 1.0} for _ in head_pos],
        )
    )

    arm_rings = [
        (0.0, 0.050 * limb, 0.050 * limb),
        (-0.16, 0.045 * limb, 0.045 * limb),
        (-0.34, 0.038 * limb, 0.038 * limb),
        (-0.52, 0.031 * limb, 0.031 * limb),
        (-0.62, 0.026 * limb, 0.026 * limb),
    ]
    for side, sign in (("L", 1.0), ("R", -1.0)):
        arm_pos, arm_nrm, arm_idx = tube(arm_rings, segments=16)
        arm_pos, arm_nrm = transform_geometry(
            arm_pos,
            arm_nrm,
            rot_z(ARM_TILT * sign),
            (sign * sw * 0.86, 1.40, 0.0),
        )
        parts.append(
            MeshPart(
                f"body_arm_{side.lower()}",
                "skin",
                arm_pos,
                arm_nrm,
                arm_idx,
                [arm_weights(point, side, spec) for point in arm_pos],
            )
        )

    leg_rings = [
        (0.0, 0.080 * limb, 0.082 * limb),
        (-0.20, 0.070 * limb, 0.072 * limb),
        (-0.46, 0.055 * limb, 0.058 * limb),
        (-0.72, 0.042 * limb, 0.044 * limb),
        (-0.86, 0.036 * limb, 0.038 * limb),
    ]
    for side, sign in (("L", 1.0), ("R", -1.0)):
        leg_pos, leg_nrm, leg_idx = tube(leg_rings, segments=16)
        leg_pos, leg_nrm = transform_geometry(
            leg_pos,
            leg_nrm,
            np.eye(3),
            (sign * hip * 0.45, HIP_Y - 0.02, 0.0),
        )
        parts.append(
            MeshPart(
                f"body_leg_{side.lower()}",
                "skin",
                leg_pos,
                leg_nrm,
                leg_idx,
                [leg_weights(point, side, spec) for point in leg_pos],
            )
        )

    # Hair is authored in three silhouettes and toggled by the client.
    short_pos, short_nrm, short_idx = ellipsoid((0, 1.638, -0.002), (0.090, 0.080, 0.096), rings=10, segments=20, phi_max=math.pi * 0.52)
    parts.append(MeshPart("hair_short", "hair", short_pos, short_nrm, short_idx, [{"head": 1.0} for _ in short_pos]))

    bun_pos, bun_nrm, bun_idx = ellipsoid((0, 1.635, -0.004), (0.092, 0.086, 0.098), rings=10, segments=18, phi_max=math.pi * 0.55)
    bun_back_pos, bun_back_nrm, bun_back_idx = ellipsoid((0, 1.648, -0.092), (0.046, 0.046, 0.046), rings=8, segments=14)
    bun_pos = np.vstack([bun_pos, bun_back_pos])
    bun_nrm = np.vstack([bun_nrm, bun_back_nrm])
    bun_idx = np.concatenate([bun_idx, bun_back_idx + (len(bun_pos) - len(bun_back_pos))])
    parts.append(MeshPart("hair_bun", "hair", bun_pos, bun_nrm, bun_idx, [{"head": 1.0} for _ in bun_pos]))

    cap_pos, cap_nrm, cap_idx = ellipsoid((0, 1.632, -0.004), (0.096, 0.092, 0.104), rings=10, segments=18, phi_max=math.pi * 0.58)
    fall_pos, fall_nrm, fall_idx = tube([(1.60, 0.098, 0.050), (1.44, 0.104, 0.052), (1.30, 0.086, 0.044)], segments=16)
    long_pos = np.vstack([cap_pos, fall_pos])
    long_nrm = np.vstack([cap_nrm, fall_nrm])
    long_idx = np.concatenate([cap_idx, fall_idx + len(cap_pos)])
    parts.append(MeshPart("hair_long", "hair", long_pos, long_nrm, long_idx, [{"head": 1.0} for _ in long_pos]))

    return parts


def build_garment_parts(spec: RigSpec) -> list[MeshPart]:
    sw, chest, waist, hip = spec.shoulder, spec.chest, spec.waist, spec.hip
    parts: list[MeshPart] = []

    top_rings = [
        # A narrow neck opening, then a shoulder flare. Open ends avoid the flat
        # "shelf" a capped tube would produce at the shoulders and hem.
        (1.445, sw * 0.58, chest * 0.52),
        (1.415, sw * 1.02, max(chest * 0.72, 0.106)),
        (1.34, chest * 1.12, chest * 0.78),
        (1.20, chest * 1.12, chest * 0.80),
        (1.06, waist * 1.36, waist * 0.95),
        (0.94, hip * 1.16, hip * 0.92),
        (0.86, hip * 1.20, hip * 0.96),
        (spec.top_length, hip * 1.26, hip * 1.0),
    ]
    top_pos, top_nrm, top_idx = tube(top_rings, segments=24, cap=False)
    parts.append(
        MeshPart(
            "garment_top",
            "top",
            top_pos,
            top_nrm,
            top_idx,
            [torso_weights(float(point[1])) for point in top_pos],
        )
    )

    sleeve_rings = [
        (0.035, 0.070, 0.070),
        (0.01, 0.066, 0.066),
        (-0.16, 0.059, 0.059),
        (-0.34, 0.050, 0.050),
        (-0.52, 0.046, 0.046),
        (-0.60, 0.044, 0.044),
    ]
    for side, sign in (("L", 1.0), ("R", -1.0)):
        sleeve_pos, sleeve_nrm, sleeve_idx = tube(sleeve_rings, segments=16, cap=False)
        sleeve_pos, sleeve_nrm = transform_geometry(
            sleeve_pos,
            sleeve_nrm,
            rot_z(ARM_TILT * sign),
            (sign * sw * 0.86, 1.400, 0.0),
        )
        parts.append(
            MeshPart(
                f"garment_sleeve_{side.lower()}",
                "sleeves",
                sleeve_pos,
                sleeve_nrm,
                sleeve_idx,
                [arm_weights(point, side, spec) for point in sleeve_pos],
            )
        )

    for side, sign in (("L", 1.0), ("R", -1.0)):
        x = sign * hip * 0.45
        leg_rings = [
            (0.97, 0.108, 0.118),
            (0.80, 0.122 + spec.bottom_baggy, 0.126 + spec.bottom_baggy),
            (0.54, 0.110 + spec.bottom_baggy, 0.114 + spec.bottom_baggy),
            (0.28, 0.090 + spec.bottom_baggy * 0.6, 0.092 + spec.bottom_baggy * 0.6),
            (0.08, 0.072, 0.074),
        ]
        bottom_pos, bottom_nrm, bottom_idx = tube(leg_rings, segments=18)
        bottom_pos, bottom_nrm = transform_geometry(bottom_pos, bottom_nrm, np.eye(3), (x, 0.0, 0.0))
        weights = [bottom_weights(point, spec) for point in bottom_pos]
        if side == "L":
            # A single waistband bridges the two trouser legs so the crotch is
            # closed. It is merged into the left leg mesh to keep the slot
            # mapping (and the draw calls) small.
            band_pos, band_nrm, band_idx = tube(
                [(1.00, hip * 1.02, hip * 0.78), (0.90, hip * 1.06, hip * 0.82)],
                segments=20,
                cap=False,
            )
            band_idx = band_idx + len(bottom_pos)
            bottom_pos = np.vstack([bottom_pos, band_pos])
            bottom_nrm = np.vstack([bottom_nrm, band_nrm])
            bottom_idx = np.concatenate([bottom_idx, band_idx])
            weights.extend({"hips": 1.0} for _ in range(len(band_pos)))
        parts.append(
            MeshPart(
                f"garment_bottom_{side.lower()}",
                "bottom",
                bottom_pos,
                bottom_nrm,
                bottom_idx,
                weights,
            )
        )

    outer_rings = [
        (1.44, sw * 0.64, chest * 0.60),
        (1.405, sw * 1.06, max(chest * 0.86, 0.124)),
        (1.32, chest * 1.30, chest * 0.98),
        (1.15, chest * 1.22, chest * 0.94),
        (1.045, waist * 1.46, waist * 1.06),
    ]
    # Open front: a full cylinder would swallow the kameez beneath it.
    outer_pos, outer_nrm, outer_idx = tube(
        outer_rings,
        segments=22,
        cap=False,
        start_angle=math.radians(104),
        end_angle=math.radians(436),
    )
    parts.append(
        MeshPart(
            "garment_outer",
            "outer",
            outer_pos,
            outer_nrm,
            outer_idx,
            [torso_weights(float(point[1])) for point in outer_pos],
        )
    )

    drape = resample_path(
        [
            (sw * 0.50, 1.48, 0.00),
            (sw * 0.70, 1.41, 0.10),
            (sw * 0.72, 1.30, 0.19),
            (sw * 0.52, 1.18, 0.212),
            (sw * 0.30, 1.04, 0.218),
            (sw * 0.12, 0.94, 0.21),
        ],
        count=18,
    )
    dupatta_pos, dupatta_nrm, dupatta_idx = strip(drape, width=max(chest * 1.04, 0.15))
    parts.append(
        MeshPart(
            "garment_dupatta",
            "dupatta",
            dupatta_pos,
            dupatta_nrm,
            dupatta_idx,
            [torso_weights(float(point[1])) for point in dupatta_pos],
        )
    )

    return parts


def build_accessory_parts(spec: RigSpec) -> list[MeshPart]:
    parts: list[MeshPart] = []
    hip = spec.hip

    for side, sign in (("L", 1.0), ("R", -1.0)):
        x = sign * hip * 0.45
        shoe_pos, shoe_nrm, shoe_idx = ellipsoid((0, 0.0, 0), (0.075, 0.048, 0.135), rings=10, segments=18)
        shoe_pos = shoe_pos + np.array([x, 0.055, 0.035], dtype=np.float32)
        cuff_pos, cuff_nrm, cuff_idx = tube([(0.13, 0.058, 0.064), (0.03, 0.062, 0.066)], segments=14, cap=False)
        cuff_pos = cuff_pos + np.array([x, 0.0, 0.0], dtype=np.float32)
        positions = np.vstack([shoe_pos, cuff_pos])
        normals = np.vstack([shoe_nrm, cuff_nrm])
        indices = np.concatenate([shoe_idx, cuff_idx + len(shoe_pos)])
        parts.append(
            MeshPart(
                f"footwear_{side.lower()}",
                "footwear",
                positions,
                normals,
                indices,
                [{f"foot_{side}": 1.0} for _ in positions],
            )
        )

        watch_pos, watch_nrm, watch_idx = tube([(0.015, 0.036, 0.036), (-0.015, 0.036, 0.036)], segments=14, cap=False)
        watch_pos, watch_nrm = transform_geometry(
            watch_pos,
            watch_nrm,
            rot_z(ARM_TILT * sign),
            (sign * spec.shoulder * 0.86, 1.40, 0.0),
        )
        # Move the band from the shoulder pivot to the wrist along the arm axis.
        wrist_offset = rot_z(ARM_TILT * sign) @ np.array([0.0, -0.575, 0.0])
        watch_pos = watch_pos + wrist_offset.astype(np.float32)
        parts.append(
            MeshPart(
                f"accessory_watch_{side.lower()}",
                "watch",
                watch_pos,
                watch_nrm,
                watch_idx,
                [{f"hand_{side}": 1.0} for _ in watch_pos],
            )
        )

    bag_pos, bag_nrm, bag_idx = ellipsoid((0, 0, 0), (0.085, 0.105, 0.035), rings=10, segments=16)
    bag_pos = bag_pos + np.array([-0.24, 1.00, 0.10], dtype=np.float32)
    strap_pos, strap_nrm, strap_idx = strip(
        resample_path([(-0.16, 1.40, 0.02), (-0.24, 1.24, 0.10), (-0.25, 1.08, 0.10)], count=8),
        width=0.022,
    )
    parts.append(
        MeshPart(
            "accessory_bag",
            "bag",
            np.vstack([bag_pos, strap_pos]),
            np.vstack([bag_nrm, strap_nrm]),
            np.concatenate([bag_idx, strap_idx + len(bag_pos)]),
            [{"hips": 1.0} for _ in bag_pos] + [torso_weights(float(point[1])) for point in strap_pos],
        )
    )

    cap_pos, cap_nrm, cap_idx = ellipsoid((0, 1.662, 0.006), (0.096, 0.070, 0.102), rings=8, segments=18, phi_max=math.pi * 0.52)
    brim_pos, brim_nrm, brim_idx = ellipsoid((0, 1.642, 0.115), (0.082, 0.012, 0.060), rings=6, segments=14, phi_max=math.pi * 0.5)
    parts.append(
        MeshPart(
            "accessory_cap",
            "cap",
            np.vstack([cap_pos, brim_pos]),
            np.vstack([cap_nrm, brim_nrm]),
            np.concatenate([cap_idx, brim_idx + len(cap_pos)]),
            [{"head": 1.0} for _ in range(len(cap_pos) + len(brim_pos))],
        )
    )
    return parts


# ---------------------------------------------------------------------------
# animation authoring
# ---------------------------------------------------------------------------
def build_clip(name: str, spec: RigSpec, bones: list[dict]) -> dict:
    """Return {duration, frames: [(time, {bone: {rotation, translation}})]}."""
    rest = rest_rotations(bones)
    if name == "idle":
        duration, loop = 4.0, True
    elif name == "walk":
        duration, loop = 1.2, True
    elif name == "turn":
        duration, loop = 1.8, False
    else:
        raise ValueError(name)

    frames = []
    total = int(round(duration * FPS))
    for index in range(total + 1):
        t = index / total
        clock = t * math.tau
        pose: dict[str, dict] = {}

        if name == "idle":
            breathe = math.sin(clock)
            sway = math.sin(clock * 0.5)
            pose["hips"] = {
                "translation": (0.0, 0.004 * breathe, 0.0),
                "rotation": quat_mul(quat_from_axis("y", 0.01 * sway), quat_from_axis("z", 0.005 * sway)),
            }
            pose["spine"] = {"rotation": quat_from_axis("x", 0.012 * breathe)}
            pose["chest"] = {"rotation": quat_mul(quat_from_axis("x", -0.018 * breathe), quat_from_axis("y", 0.012 * sway))}
            pose["neck"] = {"rotation": quat_from_axis("y", 0.035 * math.sin(clock * 0.5 + 0.6))}
            pose["head"] = {"rotation": quat_from_axis("x", 0.02 * math.sin(clock + 1.0))}
            for side, sign in (("L", 1.0), ("R", -1.0)):
                pose[f"upper_arm_{side}"] = {"rotation": quat_from_axis("x", 0.025 * math.sin(clock + sign * 0.4))}
                pose[f"forearm_{side}"] = {"rotation": quat_from_axis("x", 0.04 + 0.02 * math.sin(clock + 1.2))}
        elif name == "walk":
            swing = math.sin(clock)
            double = math.sin(clock * 2)
            pose["hips"] = {
                "translation": (0.012 * math.sin(clock), 0.018 * abs(double) - 0.004, 0.006 * math.cos(clock)),
                "rotation": quat_mul(quat_from_axis("y", 0.07 * swing), quat_from_axis("z", 0.02 * swing)),
            }
            pose["spine"] = {"rotation": quat_from_axis("y", -0.03 * swing)}
            pose["chest"] = {"rotation": quat_mul(quat_from_axis("y", -0.05 * swing), quat_from_axis("x", 0.015 * double))}
            pose["neck"] = {"rotation": quat_from_axis("y", 0.03 * swing)}
            for side, sign in (("L", 1.0), ("R", -1.0)):
                phase = swing * sign
                pose[f"thigh_{side}"] = {"rotation": quat_from_axis("x", -0.40 * phase)}
                knee = 0.08 + 0.44 * max(0.0, -phase)
                pose[f"shin_{side}"] = {"rotation": quat_from_axis("x", knee)}
                pose[f"foot_{side}"] = {"rotation": quat_from_axis("x", -0.18 * phase - knee * 0.35)}
                pose[f"upper_arm_{side}"] = {"rotation": quat_from_axis("x", 0.30 * phase)}
                pose[f"forearm_{side}"] = {"rotation": quat_from_axis("x", 0.18 + 0.12 * max(0.0, phase))}
            pose["shoulder_L"] = {"rotation": quat_from_axis("z", 0.02 * swing)}
            pose["shoulder_R"] = {"rotation": quat_from_axis("z", 0.02 * swing)}
        else:  # turn
            eased = smoothstep(t)
            angle = math.tau * eased
            pose["hips"] = {
                "translation": (0.0, 0.01 * math.sin(math.pi * t), 0.0),
                "rotation": quat_from_axis("y", angle),
            }
            pose["spine"] = {"rotation": quat_from_axis("y", 0.08 * math.sin(math.pi * t))}
            pose["chest"] = {"rotation": quat_from_axis("z", 0.04 * math.sin(math.pi * t))}
            pose["neck"] = {"rotation": quat_from_axis("y", -0.12 * math.sin(math.pi * t))}
            for side, sign in (("L", 1.0), ("R", -1.0)):
                pose[f"upper_arm_{side}"] = {
                    "rotation": quat_from_axis("z", -0.22 * sign * math.sin(math.pi * t))
                }
                pose[f"forearm_{side}"] = {"rotation": quat_from_axis("x", 0.2 * math.sin(math.pi * t))}
                pose[f"thigh_{side}"] = {"rotation": quat_from_axis("x", 0.12 * sign * math.sin(math.pi * t))}
                pose[f"shin_{side}"] = {"rotation": quat_from_axis("x", 0.2 * max(0.0, sign * math.sin(math.pi * t)))}

        # Animation tracks replace a node's local transform, so compose with
        # the bone's rest rotation and add its rest translation. Without this
        # the mixer would collapse the skeleton onto the origin.
        base_translation = {bone["name"]: np.array(bone["translation"], dtype=np.float64) for bone in bones}
        for bone, channel in pose.items():
            channel["rotation"] = quat_mul(
                rest[bone], channel.get("rotation", np.array([0.0, 0.0, 0.0, 1.0]))
            )
            if "translation" in channel:
                channel["translation"] = tuple(base_translation[bone] + np.array(channel["translation"]))
        frames.append((t * duration, pose))

    return {"name": name, "duration": duration, "loop": loop, "frames": frames}


# ---------------------------------------------------------------------------
# GLB writer
# ---------------------------------------------------------------------------
class GlbBuilder:
    def __init__(self) -> None:
        self.buffer = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []

    def _align(self, data: bytes) -> bytes:
        padding = (-len(data)) % 4
        return data + b"\x00" * padding

    def add_view(self, payload: bytes, target: int | None = None) -> int:
        aligned = self._align(payload)
        offset = len(self.buffer)
        self.buffer.extend(aligned)
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(payload)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        return len(self.views) - 1

    def add_accessor(
        self,
        payload: bytes,
        component_type: int,
        count: int,
        accessor_type: str,
        *,
        target: int | None = None,
        minimum=None,
        maximum=None,
    ) -> int:
        view = self.add_view(payload, target)
        accessor = {
            "bufferView": view,
            "componentType": component_type,
            "count": count,
            "type": accessor_type,
        }
        if minimum is not None:
            accessor["min"] = [round(float(value), 6) for value in minimum]
        if maximum is not None:
            accessor["max"] = [round(float(value), 6) for value in maximum]
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def write_glb(spec: RigSpec, parts: list[MeshPart], clips: list[dict]) -> tuple[bytes, dict]:
    bones = build_bones(spec)
    bone_index = {bone["name"]: index for index, bone in enumerate(bones)}

    # Global rest transforms drive the inverse bind matrices.
    globals_: dict[str, np.ndarray] = {}
    for bone in bones:
        local = transformation(bone["translation"], bone["rotation"])
        parent = bone["parent"]
        globals_[bone["name"]] = globals_[parent] @ local if parent else local
    inverse_binds = np.stack([np.linalg.inv(globals_[bone["name"]]).T.flatten() for bone in bones]).astype(np.float32)

    builder = GlbBuilder()
    joints_accessor = builder.add_accessor(inverse_binds.tobytes(), 5126, len(bones), "MAT4")

    materials: list[str] = []
    material_index: dict[str, int] = {}

    def material_for(name: str) -> int:
        if name not in material_index:
            material_index[name] = len(materials)
            materials.append(name)
        return material_index[name]

    meshes: list[dict] = []
    mesh_nodes: list[dict] = []

    for part in parts:
        positions = np.asarray(part.positions, dtype=np.float32)
        normals = np.asarray(part.normals, dtype=np.float32)
        indices = np.asarray(part.indices, dtype=np.uint16)
        weights = part.bones or [{"hips": 1.0} for _ in positions]

        joint_ids = np.zeros((len(positions), 4), dtype=np.uint8)
        joint_weights = np.zeros((len(positions), 4), dtype=np.float32)
        for vertex, influences in enumerate(weights):
            entries = sorted(influences.items(), key=lambda item: -item[1])[:MAX_INFLUENCES]
            total = sum(weight for _, weight in entries) or 1.0
            for slot, (bone_name, weight) in enumerate(entries):
                joint_ids[vertex, slot] = bone_index[bone_name]
                joint_weights[vertex, slot] = weight / total

        pos_acc = builder.add_accessor(
            positions.tobytes(),
            5126,
            len(positions),
            "VEC3",
            target=34962,
            minimum=positions.min(axis=0),
            maximum=positions.max(axis=0),
        )
        nrm_acc = builder.add_accessor(normals.tobytes(), 5126, len(normals), "VEC3", target=34962)
        joint_acc = builder.add_accessor(joint_ids.tobytes(), 5121, len(joint_ids), "VEC4", target=34962)
        weight_acc = builder.add_accessor(joint_weights.tobytes(), 5126, len(joint_weights), "VEC4", target=34962)
        idx_acc = builder.add_accessor(indices.tobytes(), 5123, len(indices), "SCALAR", target=34963)

        meshes.append(
            {
                "name": f"{part.name}_mesh",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": pos_acc,
                            "NORMAL": nrm_acc,
                            "JOINTS_0": joint_acc,
                            "WEIGHTS_0": weight_acc,
                        },
                        "indices": idx_acc,
                        "material": material_for(part.material),
                        "mode": 4,
                    }
                ],
            }
        )
        mesh_nodes.append(
            {
                "name": part.name,
                "mesh": len(meshes) - 1,
                "skin": 0,
            }
        )

    # Bone nodes (nodes 0..n-1), then mesh nodes, then the armature root.
    nodes: list[dict] = []
    for bone in bones:
        node = {"name": bone["name"], "translation": bone["translation"]}
        if any(abs(value) > 1e-9 for value in bone["rotation"]):
            node["rotation"] = bone["rotation"]
        nodes.append(node)
    for bone in bones:
        if bone["parent"]:
            nodes[bone_index[bone["parent"]]].setdefault("children", []).append(bone_index[bone["name"]])

    mesh_node_start = len(nodes)
    nodes.extend(mesh_nodes)
    armature_index = len(nodes)
    nodes.append({"name": "Armature", "children": [bone_index["hips"]]})

    # Animation channels target the bone nodes directly.
    animations: list[dict] = []
    for clip in clips:
        frames = clip["frames"]
        times = np.array([frame[0] for frame in frames], dtype=np.float32)
        time_acc = builder.add_accessor(times.tobytes(), 5126, len(times), "SCALAR", minimum=[float(times.min())], maximum=[float(times.max())])
        samplers = []
        channels = []
        animated_bones = sorted({bone for _, pose in frames for bone in pose})
        for bone in animated_bones:
            if any("translation" in pose.get(bone, {}) for _, pose in frames):
                values = []
                previous = None
                for _, pose in frames:
                    value = np.array(pose[bone]["translation"], dtype=np.float32)
                    if previous is not None and np.linalg.norm(value - previous) < 1e-6:
                        value = previous
                    previous = value
                    values.append(value)
                arr = np.stack(values).astype(np.float32)
                acc = builder.add_accessor(arr.tobytes(), 5126, len(arr), "VEC3")
                samplers.append({"input": time_acc, "output": acc, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": bone_index[bone], "path": "translation"}})

            if any("rotation" in pose.get(bone, {}) for _, pose in frames):
                values = []
                previous = None
                for _, pose in frames:
                    value = np.array(pose[bone]["rotation"], dtype=np.float64)
                    value /= np.linalg.norm(value) or 1.0
                    if previous is not None and np.dot(previous, value) < 0:
                        value = -value
                    previous = value
                    values.append(value)
                arr = np.stack(values).astype(np.float32)
                acc = builder.add_accessor(arr.tobytes(), 5126, len(arr), "VEC4")
                samplers.append({"input": time_acc, "output": acc, "interpolation": "LINEAR"})
                channels.append({"sampler": len(samplers) - 1, "target": {"node": bone_index[bone], "path": "rotation"}})
        animations.append({"name": clip["name"], "samplers": samplers, "channels": channels})

    palette = {
        "skin": [0.788, 0.604, 0.463, 1.0],
        "hair": [0.141, 0.11, 0.094, 1.0],
        "top": [0.36, 0.28, 0.22, 1.0],
        "sleeves": [0.36, 0.28, 0.22, 1.0],
        "bottom": [0.72, 0.68, 0.60, 1.0],
        "outer": [0.28, 0.25, 0.22, 1.0],
        "dupatta": [0.66, 0.32, 0.28, 1.0],
        "footwear": [0.20, 0.16, 0.13, 1.0],
        "bag": [0.42, 0.32, 0.22, 1.0],
        "watch": [0.72, 0.62, 0.36, 1.0],
        "cap": [0.32, 0.30, 0.27, 1.0],
    }

    gltf = {
        "asset": {"version": "2.0", "generator": "AI Fashion Studio rigged avatar builder"},
        "scene": 0,
        "scenes": [{"name": spec.label, "nodes": [armature_index] + list(range(mesh_node_start, mesh_node_start + len(mesh_nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "skins": [
            {
                "name": "AtelierRig",
                "joints": list(range(len(bones))),
                "skeleton": bone_index["hips"],
                "inverseBindMatrices": joints_accessor,
            }
        ],
        "materials": [
            {
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": palette[name],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.9 if name in {"skin", "top", "sleeves", "bottom", "dupatta"} else 0.7,
                },
                "doubleSided": True,
            }
            for name in materials
        ],
        "animations": animations,
        "buffers": [{"byteLength": len(builder._align(bytes(builder.buffer)))}],
        "bufferViews": builder.views,
        "accessors": builder.accessors,
    }

    raw_json = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_chunk = raw_json + b" " * ((-len(raw_json)) % 4)
    bin_chunk = builder._align(bytes(builder.buffer))
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    glb = bytearray()
    glb += struct.pack("<III", 0x46546C67, 2, total)
    glb += struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
    glb += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk

    triangles = sum(len(part.indices) // 3 for part in parts)
    vertices = sum(len(part.positions) for part in parts)
    stats = {
        "bytes": len(glb),
        "bones": len(bones),
        "meshes": len(parts),
        "vertices": vertices,
        "triangles": triangles,
        "animations": [{"id": clip["name"], "duration": clip["duration"], "loop": clip["loop"]} for clip in clips],
        "pieces": [part.name for part in parts],
    }
    return bytes(glb), stats


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_models = []
    all_pieces: dict[str, dict] = {}
    for spec in RIGS:
        parts = build_body_parts(spec) + build_garment_parts(spec) + build_accessory_parts(spec)
        clips = [build_clip(name, spec, build_bones(spec)) for name in ("idle", "walk", "turn")]
        payload, stats = write_glb(spec, parts, clips)
        target = OUTPUT_DIR / f"rigged-{spec.slug}.glb"
        target.write_bytes(payload)
        manifest_models.append(
            {
                "id": spec.slug,
                "label": spec.label,
                "presentation": spec.presentation,
                "file": target.name,
                **stats,
            }
        )
        for part in parts:
            all_pieces.setdefault(part.name, {"material": part.material, "groups": sorted({p.material for p in parts if p.name.startswith(part.name.rsplit("_", 1)[0])})})
        print(f"wrote {target.relative_to(ROOT)}  ({stats['bytes'] / 1024:.1f} kB · {stats['triangles']} tris · {stats['bones']} bones · {len(clips)} clips)")

    manifest = {
        "version": 1,
        "generator": "scripts/build_rigged_avatars.py",
        "note": "Authored sample wardrobe, skinned to the shared AtelierRig skeleton. Not a garment auto-fit system.",
        "models": manifest_models,
        "animations": [
            {"id": "idle", "label": "Idle", "loop": True, "description": "Relaxed standing breath and weight shift."},
            {"id": "walk", "label": "Walk", "loop": True, "description": "In-place walk cycle with arm swing and heel lift."},
            {"id": "turn", "label": "Turn", "loop": False, "description": "Slow pivot in place, back to the front."},
        ],
        "slot_mapping": {
            "dress": ["garment_top", "garment_sleeve_l", "garment_sleeve_r"],
            "top": ["garment_top", "garment_sleeve_l", "garment_sleeve_r"],
            "bottom": ["garment_bottom_l", "garment_bottom_r"],
            "outerwear": ["garment_outer"],
            "footwear": ["footwear_l", "footwear_r"],
            "bag": ["accessory_bag"],
            "watch": ["accessory_watch_l", "accessory_watch_r"],
            "headwear": ["accessory_cap"],
            "accessory": ["garment_dupatta"],
        },
    }
    (OUTPUT_DIR / "rigged-models.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("wrote", (OUTPUT_DIR / "rigged-models.json").relative_to(ROOT))


if __name__ == "__main__":
    main()
