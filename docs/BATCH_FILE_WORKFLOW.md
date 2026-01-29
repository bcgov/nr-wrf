# Download Batch File Workflow

## Overview

This document clarifies the **two-stage download process** used by the NR-WRF application. This is a critical architectural detail that affects system design and resource requirements.

## Architecture Summary

### What the Backend Does

The backend **does NOT** download the actual WRF data files (which can be multiple GB). Instead, it:

1. **Looks up tiles** from the CSV index based on user's search parameters
2. **Extracts URLs** from the index for matching tiles
3. **Generates download.bat** - A batch file containing curl commands with these URLs
4. **Packages support files** - Config files, utilities, and the download script
5. **Creates a small zip** (~KB size) containing scripts and configs
6. **Returns zip to user** for download from the web application

### What the User Does

Users receive a small download package and run it locally:

1. **Download zip** from web application (~KB, not GB)
2. **Extract zip** to local directory
3. **Run start.bat** - Main orchestrator script
4. **start.bat executes download.bat** - Downloads actual data files using curl
5. **Data files download** from object storage to user's machine (potentially GB)
6. **Files are processed locally** using included utilities (m3d_bild.exe, 7z.exe)

## Download Package Contents

The zip file contains:

| File           | Purpose                                      | Size  |
| -------------- | -------------------------------------------- | ----- |
| `download.bat` | Curl commands to download data files         | ~KB   |
| `start.bat`    | Orchestrator - runs download then processing | ~KB   |
| `readme.txt`   | User instructions                            | ~KB   |
| `m3d_bild.inp` | Configuration with search parameters         | ~KB   |
| `7z.exe`       | 7-Zip utility for decompression              | ~1 MB |
| `m3d_bild.exe` | Data processing utility                      | ~1 MB |

**Total package size:** ~2-3 MB (scripts + utilities)

## Example download.bat Structure

```batch
@echo off
echo Downloading WRF data files...
echo This may take a while depending on file sizes.

echo [1/15] Downloading wrfout_d05_0026_2019.nc...
curl -O "https://nrs.objectstore.gov.bc.ca/wrfdel/aermod/d05/0026/wrfout_d05_0026_2019.nc" --retry 10
if errorlevel 1 (
  echo ERROR: Failed to download wrfout_d05_0026_2019.nc
  pause
  exit /b 1
)

echo [2/15] Downloading wrfout_d05_0027_2019.nc...
curl -O "https://nrs.objectstore.gov.bc.ca/wrfdel/aermod/d05/0027/wrfout_d05_0027_2019.nc" --retry 10
if errorlevel 1 (
  echo ERROR: Failed to download wrfout_d05_0027_2019.nc
  pause
  exit /b 1
)

...

echo.
echo All files downloaded successfully!
pause
```

## Why This Architecture?

### Benefits

1. **Reduced Server Load**

   - Backend doesn't download large files
   - No large file storage required on server
   - Minimal bandwidth usage by backend

2. **Better User Experience**

   - Fast initial download (just scripts/configs)
   - User controls timing of large data download
   - Can retry failed downloads easily
   - Progress visible in terminal

3. **Scalability**

   - Backend can handle many concurrent requests
   - No server-side storage bottleneck
   - Object storage handles the heavy lifting

4. **Flexibility**
   - Users can download data files at their convenience
   - Can re-run download.bat if needed
   - Easy to modify curl commands if needed

### Trade-offs

1. **User Responsibility**

   - Users must have curl installed
   - Users must run batch file locally
   - Requires understanding of command-line tools

2. **Error Handling**
   - Download failures happen on user's machine
   - User must troubleshoot network issues
   - No server-side retry logic

## Implementation Impact

### Backend (zip-file.service.ts)

```typescript

async createDownloadPackage(urls: string[]) {
  // Generate download.bat with curl commands for user to download manually.
  const downloadBat = this.createDownloadBatFromUrls(urls);

  // Package scripts and utilities (NOT data files)
  await this.zipFiles(config, downloadBat, utilities);
}
```

### Resource Requirements

| Component         | Old Understanding           | Actual                     |
| ----------------- | --------------------------- | -------------------------- |
| Backend Memory    | GB (for file buffering)     | MB (for script generation) |
| Backend Bandwidth | GB per request              | KB per request             |
| Backend Storage   | Temp storage for data files | Minimal (just zip staging) |
| User Bandwidth    | KB (just zip)               | GB (data files)            |
| User Storage      | Minimal                     | GB (data files)            |

## Testing Implications

### Backend Testing

- Focus on **script generation** correctness
- Verify **URL accuracy** in download.bat
- Test **config file** generation
- Ensure **zip packaging** works properly

**NOT Required:**

- Testing large file downloads
- Object storage connectivity from backend
- Data file integrity verification

### User Acceptance Testing

- Download package from application
- Extract and verify contents
- Run start.bat successfully
- Verify curl downloads files correctly
- Confirm data processing works

## Deployment Considerations

### Server Requirements

- **Minimal storage** - Only for temporary zip staging (~MB)
- **Low bandwidth** - Only serves small packages (~KB)
- **Minimal memory** - Script generation is lightweight
- **Fast response** - No waiting for large downloads

### User Requirements

- **Curl installed** - Required for download.bat execution
- **Adequate storage** - Must have space for data files (GB)
- **Good network connection** - For downloading large data files
- **Command-line access** - Must be able to run batch files

## Documentation Requirements

Update the following to reflect this architecture:

- [x] TECHNICAL_DESIGN.md - Architecture diagrams and workflow
- [x] IMPLEMENTATION_GUIDE.md - Code examples and methods
- [ ] User-facing documentation - Instructions for running batch files
- [ ] API documentation - Clarify what endpoints return
- [ ] README.md - Add batch file workflow section (if needed)

## Related Files

- `docs/TECHNICAL_DESIGN.md` - Full technical specification
- `docs/IMPLEMENTATION_GUIDE.md` - Developer implementation steps
- `frontend/src/zip-file/zip-file.service.ts` - Zip package generation
- `backend/src/index/index.service.ts` - Index lookup service

## Questions & Answers

**Q: Why not have the backend download files and zip them?**
A: Data files can be several GB. Having the backend download them would:

- Require massive storage
- Create bandwidth bottlenecks
- Slow down response times
- Limit scalability

**Q: What if users don't have curl installed?**
A: Consider these options:

- Include curl.exe in the package
- Provide alternative download methods
- Add pre-flight check in documentation
- Use PowerShell `Invoke-WebRequest` as alternative

**Q: Can users modify the download.bat?**
A: Yes! Users can:

- Add/remove specific files
- Change retry counts
- Modify download location
- Add custom error handling

**Q: What happens if a download fails?**
A: The batch file:

- Detects curl error codes
- Displays error message
- Pauses for user review
- Exits with error code
- User can re-run to retry

## Revision History

| Date       | Author | Changes                                      |
| ---------- | ------ | -------------------------------------------- |
| 2024-01-XX | System | Initial documentation of batch file workflow |
