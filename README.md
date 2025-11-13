# nr-wrf

Air quality dispersion data publication app

## Overview

This application provides air quality dispersion data through two separate search interfaces:

### CALPUF Search (index.html)

- **Domain File**: Uses `domaininfo_bcwrf.csv` which contains grid coordinates mapping I, J values to LAT, LONG positions
  - Format: `I,J,LAT,LON` (e.g., `2,2,46.4292,-137.674`)
  - Grid dimensions: MAX_I = 476, MAX_J = 425
- **Object Store**: Files are fetched from `https://nrs.objectstore.gov.bc.ca/kadkvt/`
- **Search Functionality**:
  - Users can search by drawing rectangles on a map or entering coordinates and date ranges
  - The application converts lat/long selections to I/J grid coordinates
  - Constructs URLs to fetch 10x10km tile files from object storage based on year, month, and grid position
  - File format: `x{I1}y{J1}x{I2}y{J2}.{YYYY}{MM}.10x10.m3d.7z`
- **Output**: Packages selected files into a `nr-wrf.zip` file with processing utilities (7z.exe, m3d_bild.exe, start.bat, readme.txt, and generated config file)

### AERMOD Search (aermod.html)

- **Domain File**: Uses tile-based domain information accessed via backend API (`/mapping/findClosestPoint`)
- **Object Store**: Files are fetched from `https://nrs.objectstore.gov.bc.ca/qfncae/support_files/`
- **Search Functionality**:
  - Users search by clicking on the map or entering specific lat/long coordinates with date ranges
  - The backend finds the closest I, J grid point and tile ID for the selected coordinates
  - Fetches files from object storage based on the tile information and date range
- **Output**: Packages selected files into a `nr-wrf_aermod.zip` file with processing utilities (start.bat, readme.txt, mmif.inp)

Both search screens use the mapping service (`geomapping.js` and `geomapping_aermod.js`) to construct object store URLs, which are then processed by the backend zip-file service to package all searched files into downloadable archives.
