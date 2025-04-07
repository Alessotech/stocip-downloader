# Stocip Downloader

A Node.js automation tool that uses Playwright to download files from Stocip.com. This tool provides a REST API for automated file downloads and batch processing.

## Features

- RESTful API endpoints for file downloads
- Batch download support (up to 10 files per batch)
- Real-time download status tracking
- Automated browser control using Playwright
- Secure login handling
- Rate limiting and CORS support
- Organized file storage in a dedicated downloads folder
- Error handling and logging

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Stocip.com account credentials

## Installation

1. Clone the repository:
```bash
git clone https://github.com/alihatem361/stocip-downloader.git
cd stocip-downloader
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
STOCIP_EMAIL=your_email@example.com
STOCIP_PASSWORD=your_password
DOWNLOAD_PATH=path/to/downloads/folder
PORT=3000
```

## API Endpoints

### Single File Download
- **POST** `/api/download`
- Request body: `{ "url": "https://example.com/file" }`
- Returns download status and file information

### Batch Download
- **POST** `/api/batch-download`
- Request body: `{ "urls": ["https://example.com/file1", "https://example.com/file2"] }`
- Returns results array with generated text for each URL
- Limited to 10 URLs per batch

### Get Download URL
- **POST** `/api/get-download-url`
- Request body: `{ "url": "https://example.com/file" }`
- Returns the generated download text

### Health Check
- **GET** `/health`
- Returns server status

## Usage

1. Start the server:
```bash
node index.js
```

2. The server will start on port 3000 (or the port specified in your .env file)

3. Use the API endpoints to download files:
```bash
# Single file download (get direct URL)
curl -X POST http://localhost:3000/api/get-download-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/file"}'

# Batch download (multiple URLs)
curl -X POST http://localhost:3000/api/batch-download \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com/file1", "https://example.com/file2"]}'
```

## Project Structure

```
stocip-downloader/
├── downloads/          # Directory where files are downloaded
├── index.js           # Main server file
├── package.json       # Project dependencies and configuration
├── .env              # Environment variables (create this file)
└── README.md         # This file
```

## Dependencies

- `playwright`: ^1.41.0
- `express`: ^4.18.2
- `cors`: ^2.8.5
- `express-rate-limit`: ^7.1.5
- `dotenv`: ^16.4.1

## Error Handling

The API includes comprehensive error handling for:
- Invalid URLs
- Authentication failures
- Download timeouts
- File system operations
- Rate limiting
- Batch processing errors

## Security Features

- Rate limiting (5 requests per 15 minutes)
- CORS support
- Environment variable configuration
- Secure credential handling
- Input validation

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests! 