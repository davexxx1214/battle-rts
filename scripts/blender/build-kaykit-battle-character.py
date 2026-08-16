"""Build one battle-ready KayKit medium-rig character with baked equipment."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy


CHARACTERS = {
    "knight": {
        "blend": "Knight.blend",
        "output": "Knight_Battle.glb",
        "equipment": (
            ("sword_1handed", "handslot.r"),
            ("shield_round_color", "handslot.l"),
        ),
    },
    "ranger": {
        "blend": "Ranger.blend",
        "output": "Ranger_Battle.glb",
        "equipment": (("bow_withString", "handslot.l"),),
    },
    "mage": {
        "blend": "Mage.blend",
        "output": "Mage_Battle.glb",
        "equipment": (("staff", "handslot.r"),),
    },
}


def parse_args() -> argparse.Namespace:
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--character", choices=CHARACTERS, required=True)
    return parser.parse_args(script_args)


def append_equipment(accessories_blend: Path, object_name: str) -> bpy.types.Object:
    with bpy.data.libraries.load(str(accessories_blend), link=False) as (available, loaded):
        if object_name not in available.objects:
            raise RuntimeError(f"Accessory {object_name!r} is missing from {accessories_blend}.")
        loaded.objects = [object_name]
    equipment = loaded.objects[0]
    if equipment is None:
        raise RuntimeError(f"Blender did not load accessory {object_name!r}.")
    bpy.context.scene.collection.objects.link(equipment)
    return equipment


def bind_to_hand_slot(
    equipment: bpy.types.Object,
    armature: bpy.types.Object,
    bone_name: str,
) -> None:
    if bone_name not in armature.data.bones:
        raise RuntimeError(f"Bone {bone_name!r} is missing from {armature.name!r}.")
    equipment.parent = armature
    equipment.parent_type = "BONE"
    equipment.parent_bone = bone_name
    equipment.location = (0.0, 0.0, 0.0)
    equipment.rotation_euler = (0.0, 0.0, 0.0)
    equipment.scale = (1.0, 1.0, 1.0)


def main() -> None:
    args = parse_args()
    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    config = CHARACTERS[args.character]
    character_blend = source_root / "SOURCE" / config["blend"]
    accessories_blend = source_root / "SOURCE" / "Adventurers_Accessories.blend"
    if not character_blend.is_file() or not accessories_blend.is_file():
        raise FileNotFoundError(f"KayKit source files are incomplete under {source_root}.")

    bpy.ops.wm.open_mainfile(filepath=str(character_blend), load_ui=False)
    armatures = [item for item in bpy.data.objects if item.type == "ARMATURE"]
    if len(armatures) != 1:
        raise RuntimeError(f"Expected one armature, found {len(armatures)}.")
    armature = armatures[0]

    equipment_objects = []
    for object_name, bone_name in config["equipment"]:
        equipment = append_equipment(accessories_blend, object_name)
        bind_to_hand_slot(equipment, armature, bone_name)
        equipment_objects.append(equipment)

    character_meshes = [
        item
        for item in bpy.context.scene.objects
        if item.type == "MESH"
        and (item.parent is armature or item.find_armature() is armature)
    ]
    if not character_meshes:
        raise RuntimeError(f"No character meshes are bound to {armature.name!r}.")
    bpy.ops.object.select_all(action="DESELECT")
    for item in [armature, *character_meshes, *equipment_objects]:
        item.select_set(True)
    bpy.context.view_layer.objects.active = armature

    output_root.mkdir(parents=True, exist_ok=True)
    output_path = output_root / config["output"]
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_def_bones=True,
        use_selection=True,
    )
    print(f"Built {args.character}: {output_path}")


if __name__ == "__main__":
    main()
