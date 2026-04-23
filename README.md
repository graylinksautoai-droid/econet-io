# EcoNet - Environmental Intelligence Command Center

EcoNet is a comprehensive environmental monitoring and intelligence platform that provides real-time climate analysis, security insights, and collaborative reporting capabilities.

## Features

### Core Capabilities
- **Real-time Environmental Monitoring** - Track air quality, water resources, and climate patterns
- **AI-Powered Analysis** - LILO AI assistant provides intelligent insights and recommendations
- **Interactive Mapping** - Advanced visualization with MapLibre GL for environmental data
- **Collaborative Reporting** - Community-driven environmental incident reporting
- **Live Camera Streaming** - Sentinel Live for real-time field monitoring
- **Marketplace Integration** - Environmental products and services marketplace

### Advanced Features
- **Leaf Reward System** - Gamified environmental engagement with redeemable rewards
- **Secure Authentication** - Multi-factor authentication with remember me functionality
- **Image Analysis** - AI-powered image processing for environmental threat detection
- **Chat Interface** - Conversational AI for environmental queries and insights
- **Mobile Responsive** - Optimized for all devices and screen sizes

## Quick Start

### Prerequisites
- Node.js 18+ 
- Modern web browser (Chrome, Firefox, Safari, Edge)
- For camera features: HTTPS connection or localhost

### Installation

#### Windows Users
```bash
# Run the setup script
setup.bat
```

#### Linux/macOS Users
```bash
# Make setup script executable and run
chmod +x setup.sh
./setup.sh
```

#### Manual Installation
```bash
# Clone the repository
git clone https://github.com/your-org/econet.git
cd econet

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm start
```

### Configuration

Edit the `.env` file with your API keys and preferences:

```env
# Map Configuration
VITE_MAP_STYLE_URL=https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json

# External APIs (Optional)
VITE_OPENWEATHER_API_KEY=your_api_key
VITE_NASA_EARTH_DATA_KEY=your_api_key

# AI Configuration
VITE_AI_ENDPOINT=http://localhost:5000/api/ai
```

## Usage

### 1. Start the Application
```bash
npm start
```

### 2. Open in Browser
Navigate to `http://localhost:5173`

### 3. Explore Features
- **Dashboard** - Main environmental monitoring interface
- **Live Camera** - Real-time field monitoring (click camera button)
- **AI Chat** - Click LILO AI orb to start conversation
- **Marketplace** - Browse and purchase environmental products
- **Map View** - Interactive environmental data visualization

## API Integration

For organizations looking to integrate EcoNet with their systems:

### Required Components
- **Backend API Server** - Node.js/Express or Python/FastAPI
- **Database** - PostgreSQL + Redis
- **External APIs** - Weather, satellite, environmental data

### Quick API Setup
```bash
# Create API server
mkdir econet-api && cd econet-api
npm init -y
npm install express cors multer

# See API_INTEGRATION_GUIDE.md for detailed setup
```

### Key API Endpoints
```
GET  /api/reports/feed          - Environmental reports feed
POST /api/reports/create        - Create new report
POST /api/upload/image          - Upload images for analysis
POST /api/ai/chat              - AI chat interface
GET  /api/environment/quality  - Environmental quality data
```

## Architecture

### Frontend Components
```
src/
components/
  LiloAI.jsx          - AI assistant interface
  MapView.jsx         - Interactive map component
  SentinelLive.jsx    - Live camera streaming
  LeafCounter.jsx     - Reward system
  Marketplace.jsx     - E-commerce interface

pages/
  Dashboard.jsx       - Main dashboard
  Login.jsx           - Authentication
  Marketplace.jsx     - Shopping interface

features/
  dashboard/
    hooks/useImageUpload.js  - Image upload logic
    services/feedService.js   - Data fetching
```

### Data Flow
1. **User Interface** - React components with Tailwind CSS
2. **State Management** - React hooks and context
3. **API Layer** - Axios for HTTP requests
4. **AI Processing** - LILO AI for intelligent analysis
5. **Data Storage** - LocalStorage + backend APIs

## Security Features

- **Secure Authentication** - JWT tokens with refresh mechanism
- **Input Validation** - Client and server-side validation
- **XSS Protection** - Content Security Policy headers
- **HTTPS Required** - Secure connections for production
- **Rate Limiting** - API endpoint protection

## Performance Optimization

- **Lazy Loading** - Components loaded on demand
- **Image Optimization** - WebP format with fallbacks
- **Caching Strategy** - Service worker for offline support
- **Bundle Optimization** - Vite build optimization
- **CDN Integration** - Static asset delivery

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 90+     | Full Support |
| Firefox | 88+     | Full Support |
| Safari  | 14+     | Full Support |
| Edge    | 90+     | Full Support |

## Troubleshooting

### Common Issues

**Map not loading**
- Check internet connection
- Verify MapLibre GL JS compatibility
- Check browser console for errors

**Camera not working**
- Ensure HTTPS connection (required for camera access)
- Check browser camera permissions
- Verify device compatibility

**AI responses not working**
- Check API key configuration
- Verify network connectivity
- Check rate limits on external APIs

**Image upload failing**
- Check file size limits (max 10MB)
- Verify supported formats (JPG, PNG, WebP)
- Check upload directory permissions

### Debug Mode
Enable debug logging:
```bash
# Set debug mode
DEBUG=true npm start
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [API_INTEGRATION_GUIDE.md](./API_INTEGRATION_GUIDE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/econet/issues)
- **Community**: [Discord Server](https://discord.gg/econet)
- **Email**: support@econet.com

## Acknowledgments

- MapLibre GL JS for interactive mapping
- React Icons for UI components
- Tailwind CSS for styling
- Framer Motion for animations
- OpenWeatherMap for weather data

---

**EcoNet** - Environmental Intelligence for a Sustainable Future
