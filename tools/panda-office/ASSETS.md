# Character assets

The four GLB characters in `public/models/` were generated locally with [Ara 3D Gen](https://github.com/olatunde85/3d-gen) version 0.18.0. Its code is MIT licensed; its exported character base assets and animation source are CC0, as documented by the project. The office uses its Female Executive, Corporate High-Flier, Cyberpunk Hacker, and Businesswoman presets. No GTA characters, art, or game files are used.

Generation command:

```powershell
npx --yes ara3d export --preset 'The Female Executive' --preset 'The Corporate High-Flier' --preset 'The Cyberpunk Hacker' --preset 'Businesswoman' --detail low --animations walk,idle,sit_idle,look_around,texting,wave --out public/models
```

The downloaded generator data remains in Ara's normal local cache; it is not part of this project. The four generated GLBs are bundled locally so the office can render without contacting a third-party model host.
