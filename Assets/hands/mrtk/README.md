# Microsoft MRTK hand source

`R_Hand_MRTK_Rig.fbx` is the right-hand RiggedHandVisualizer mesh from Microsoft's Mixed Reality Toolkit. Its original geometry, joint locations, normals and UVs are preserved by the converter. The left model is mirrored from this source to keep both hands' proportions consistent.

- Repository: [microsoft/MixedRealityToolkit-Unity](https://github.com/microsoft/MixedRealityToolkit-Unity)
- Commit: `5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500`
- [Original FBX](https://github.com/microsoft/MixedRealityToolkit-Unity/blob/5c6ab1f6fc064c9a4d9c786ae966c98c03d8b500/Assets/MRTK/SDK/Features/UX/Prefabs/RiggedHandVisualizer/R_Hand_MRTK_Rig.fbx)
- License: MIT, copyright Microsoft Corporation. The original license is included as `LICENSE.md`.
- FBX SHA-256: `32fb64b8a9963b0751958d0023178cfc29fb2c07edfabc64e83ad7f2b7e9f04d`
- License SHA-256: `fd532481d828e13a0b13ccb598e02338a3617740675a862ee6bdc1541b68e93d`

## Reproduce the models

From the project directory, using its installed dependencies:

```sh
node scripts/convert-hand-models.mjs --out path/to/output
```

An explicit output directory is required. The script writes `left.glb`, `right.glb`, `LICENSE.md` and `PROVENANCE.json`. It checks the pinned input hash before parsing and validates both complete outputs before writing. The provenance file includes the source hash, dependency revision, conversion details and output hashes.

Each hand has 1,334 indexed vertices, 2,664 triangles and 25 joints. Exact attribute matching reduces the FBX loader’s 7,992 triangle corners without merging UV seams, normal splits or different skin weights. Three zero-weight metacarpal anchors complete the WebXR joint set; the source's weighted wrist-padding joint serves as the pinky metacarpal. Source bone twists are retained with local −Z toward the fingertip and +Y dorsal. Joint transforms are stored in model space with inverse bind matrices, matching both standard glTF skinning and the Luma hand-template reader.

Three's FBXLoader keeps four skin influences per vertex. The converter merges duplicate mapped influences and normalizes them. No geometry sculpting or finger-length adjustment is performed during conversion. Renderer preparation, IK pose settings and skin-map baking are separate steps. Bake tangent-space normal maps from these indexed outputs and the final preparation settings; indexing changes tangent averaging, so maps baked from a deindexed mesh must be regenerated.

Converter version 2 produces these SHA-256 hashes with the checked-in dependency versions:

| Output | SHA-256 |
| --- | --- |
| `left.glb` | `3903e5d52ed7c541fac72b3b6017d61d0b9dbe2d840c9c1b3d63a771ab4c093c` |
| `right.glb` | `cb1bc61ecbd5b36907665b6dd9e747b7659042e493b14033f3448cffb483ab3f` |
