# Stocip Downloader

A Node.js automation tool that uses Puppeteer to download files from Stocip.com. This tool automates the login process and retrieves download URLs from the platform.

## Features

- Automated browser control using Puppeteer
- Secure login handling
- Automatic download URL extraction
- Organized file storage in a dedicated downloads folder
- Error handling and logging

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/stocip-downloader.git
cd stocip-downloader
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Run the script:
```bash
node index.js
```

The script will:
- Launch a browser in private mode
- Navigate to the Stocip login page
- Handle the login process
- Navigate to the download page
- Extract the download URL
- Save the URL to a timestamped file in the `downloads` folder

## Project Structure

```
stocip-downloader/
├── downloads/          # Directory where download URLs are saved
├── index.js           # Main script file
├── package.json       # Project dependencies and configuration
└── README.md         # This file
```

## Dependencies

- `puppeteer`: ^24.4.0
- `puppeteer-core`: ^24.4.0
- `express`: ^4.21.2
- `cors`: ^2.8.5

## Error Handling

The script includes comprehensive error handling for:
- Browser launch failures
- Login issues
- Navigation timeouts
- Missing download URLs
- File system operations

## Security Note

⚠️ Please ensure you keep your login credentials secure and never commit them to version control.

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests! 