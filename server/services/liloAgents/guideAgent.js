/**
 * LILO Guide Agent - User Interface and Chat Communication
 */

export class GuideAgent {
  constructor() {
    this.responseCategories = {
      greeting: ['hello', 'hi', 'hey', 'greetings'],
      weather: ['weather', 'temperature', 'rain', 'sun', 'climate'],
      emergency: ['emergency', 'disaster', 'danger', 'help', 'urgent'],
      environment: ['pollution', 'air quality', 'water', 'eco'],
      assistance: ['help', 'assist', 'support', 'guidance'],
      information: ['what', 'how', 'why', 'explain', 'tell me']
    };
    
    this.personality = {
      tone: 'helpful',
      style: 'conversational',
      expertise: 'environmental_intelligence'
    };
  }

  /**
   * Generate response to user message
   */
  async generateResponse(userMessage, context = {}) {
    const analysis = this.analyzeMessage(userMessage);
    const response = {
      message: '',
      category: analysis.category,
      confidence: analysis.confidence,
      action: null,
      metadata: {}
    };

    // Generate contextual response
    switch (analysis.category) {
      case 'greeting':
        response.message = this.generateGreeting(context.userName);
        break;
      case 'weather':
        response.message = await this.generateWeatherResponse(analysis, context);
        break;
      case 'emergency':
        response.message = await this.generateEmergencyResponse(analysis, context);
        response.action = 'emergency_alert';
        break;
      case 'environment':
        response.message = await this.generateEnvironmentalResponse(analysis, context);
        break;
      case 'assistance':
        response.message = this.generateAssistanceResponse(analysis, context);
        break;
      case 'information':
        response.message = await this.generateInformationResponse(analysis, context);
        break;
      default:
        response.message = this.generateDefaultResponse(analysis, context);
    }

    // Add personalization
    if (context.userName) {
      response.message = this.personalizeResponse(response.message, context.userName);
    }

    // Add contextual awareness
    if (context.location) {
      response.message = this.addLocationContext(response.message, context.location);
    }

    response.confidence = analysis.confidence;
    return response;
  }

  /**
   * Analyze user message to determine intent and category
   */
  analyzeMessage(message) {
    const lowerMessage = message.toLowerCase();
    const analysis = {
      category: 'default',
      confidence: 0.5,
      keywords: [],
      entities: [],
      sentiment: 'neutral'
    };

    // Extract keywords
    analysis.keywords = this.extractKeywords(lowerMessage);
    
    // Extract entities (locations, numbers, etc.)
    analysis.entities = this.extractEntities(message);

    // Determine sentiment
    analysis.sentiment = this.analyzeSentiment(lowerMessage);

    // Categorize message
    let bestCategory = 'default';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(this.responseCategories)) {
      const score = this.calculateCategoryScore(lowerMessage, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    analysis.category = bestCategory;
    analysis.confidence = Math.min(bestScore + 0.2, 1.0); // Boost confidence slightly

    return analysis;
  }

  /**
   * Extract keywords from message
   */
  extractKeywords(message) {
    // Simple keyword extraction - could be enhanced with NLP
    const words = message.split(' ').filter(word => word.length > 2);
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    return words.filter(word => !stopWords.includes(word));
  }

  /**
   * Extract entities from message
   */
  extractEntities(message) {
    const entities = [];

    // Extract numbers
    const numbers = message.match(/\d+/g);
    if (numbers) {
      entities.push({ type: 'number', values: numbers });
    }

    // Extract locations (simplified)
    const locationPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g, // Capitalized words (potential places)
      /\b(\w+ City|\w+ Town|\w+ Village)\b/gi
    ];

    locationPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        entities.push({ type: 'location', values: matches });
      }
    });

    return entities;
  }

  /**
   * Analyze sentiment of message
   */
  analyzeSentiment(message) {
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'love', 'wonderful', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'disaster', 'emergency', 'danger', 'worried'];

    const positiveCount = positiveWords.filter(word => message.includes(word)).length;
    const negativeCount = negativeWords.filter(word => message.includes(word)).length;

    if (negativeCount > positiveCount) return 'negative';
    if (positiveCount > negativeCount) return 'positive';
    return 'neutral';
  }

  /**
   * Calculate category score based on keyword matching
   */
  calculateCategoryScore(message, keywords) {
    const matches = keywords.filter(keyword => message.includes(keyword)).length;
    return matches / keywords.length;
  }

  /**
   * Generate greeting response
   */
  generateGreeting(userName = null) {
    const greetings = [
      "Hello! I'm LILO, your environmental intelligence assistant. How can I help you today?",
      "Hi there! I'm here to assist with environmental monitoring and insights. What's on your mind?",
      "Greetings! I'm LILO, ready to help with weather, pollution, and environmental data. What would you like to know?"
    ];

    if (userName) {
      const personalizedGreetings = [
        `Hello ${userName}! Great to connect with you again. How can I assist you today?`,
        `Hi ${userName}! I'm here to help with environmental insights. What can I do for you?`,
        `Greetings ${userName}! Ready to provide environmental intelligence. What would you like to explore?`
      ];
      return personalizedGreetings[Math.floor(Math.random() * personalizedGreetings.length)];
    }

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  /**
   * Generate weather response
   */
  async generateWeatherResponse(analysis, context) {
    const responses = [
      "I can help you with weather information! Currently, I'm monitoring conditions in your area. Would you like current conditions or a forecast?",
      "Weather data is available for your location. I can provide temperature, humidity, air quality, and forecasts. What specific information do you need?",
      "I have access to real-time weather data and forecasts. Let me know what weather information would be most helpful for you."
    ];

    // Add location-specific info if available
    if (context.location) {
      responses.push(
        `I'm monitoring weather conditions for ${context.location.city || 'your area'}. Current conditions show moderate temperatures with good air quality. Would you like detailed information?`
      );
    }

    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Generate emergency response
   */
  async generateEmergencyResponse(analysis, context) {
    const emergencyKeywords = analysis.keywords.filter(kw => 
      ['emergency', 'disaster', 'danger', 'help', 'urgent'].includes(kw)
    );

    if (emergencyKeywords.length > 0) {
      return `I understand this is urgent. I'm activating emergency protocols and checking for active alerts in your area. While I analyze the situation, please ensure your safety first. Can you provide more details about the emergency?`;
    }

    return "I'm here to help with emergency situations. I can connect you with emergency services and provide real-time environmental data. What emergency are you facing?";
  }

  /**
   * Generate environmental response
   */
  async generateEnvironmentalResponse(analysis, context) {
    const envKeywords = analysis.keywords.filter(kw => 
      ['pollution', 'air', 'water', 'quality', 'eco', 'environment'].includes(kw)
    );

    let response = "I can help with environmental data and analysis. ";

    if (envKeywords.includes('pollution') || envKeywords.includes('air')) {
      response += "I'm monitoring air quality in your area. Current AQI levels are moderate. ";
    }

    if (envKeywords.includes('water')) {
      response += "Water quality data shows good conditions for your location. ";
    }

    response += "Would you like specific environmental metrics or analysis?";

    return response;
  }

  /**
   * Generate assistance response
   */
  generateAssistanceResponse(analysis, context) {
    const capabilities = [
      "I can help you with: weather monitoring, air quality tracking, environmental alerts, disaster detection, and ecological insights. What specific area would you like assistance with?",
      "My capabilities include real-time environmental monitoring, predictive analysis, emergency coordination, and environmental education. How can I assist you?",
      "I'm equipped to help with weather forecasts, pollution tracking, biodiversity monitoring, and emergency response. What would you like to explore?"
    ];

    return capabilities[Math.floor(Math.random() * capabilities.length)];
  }

  /**
   * Generate information response
   */
  async generateInformationResponse(analysis, context) {
    const questionWords = analysis.keywords.filter(kw => 
      ['what', 'how', 'why', 'explain', 'tell'].includes(kw)
    );

    if (questionWords.length > 0) {
      return "I'd be happy to help explain environmental concepts or provide information. I can discuss weather patterns, pollution sources, climate trends, or emergency procedures. What would you like to learn about?";
    }

    return "I can provide detailed information on environmental topics. Whether you need weather data, pollution analysis, or emergency guidance, I'm here to help. What information are you looking for?";
  }

  /**
   * Generate default response
   */
  generateDefaultResponse(analysis, context) {
    const defaults = [
      "I'm LILO, your environmental intelligence assistant. I can help with weather, pollution monitoring, emergency alerts, and environmental insights. How can I assist you today?",
      "Hello! I'm here to provide environmental intelligence and support. I can help with weather data, air quality, disaster detection, and more. What would you like to know?",
      "I'm LILO, ready to assist with environmental monitoring and analysis. Whether you need weather information or emergency guidance, I'm here to help. What can I do for you?"
    ];

    return defaults[Math.floor(Math.random() * defaults.length)];
  }

  /**
   * Personalize response with user name
   */
  personalizeResponse(message, userName) {
    if (message.includes('you') && !message.includes(userName)) {
      return message.replace(/you/g, `${userName}, you`);
    }
    return message;
  }

  /**
   * Add location context to response
   */
  addLocationContext(message, location) {
    if (location.city && !message.includes(location.city)) {
      return `${message} I'm monitoring conditions specifically for ${location.city}.`;
    }
    return message;
  }

  /**
   * Generate proactive alerts
   */
  async generateProactiveAlert(alertData) {
    const alert = {
      type: 'proactive_alert',
      message: '',
      urgency: 'normal',
      action: null
    };

    switch (alertData.type) {
      case 'weather_warning':
        alert.message = "Weather alert: Conditions changing in your area. I recommend checking the latest forecast and preparing accordingly.";
        alert.urgency = 'medium';
        break;
      case 'air_quality':
        alert.message = "Air quality alert: Elevated pollution levels detected. Consider limiting outdoor activities if you have respiratory concerns.";
        alert.urgency = 'medium';
        break;
      case 'disaster_detected':
        alert.message = "Emergency alert: Environmental disaster detected in your vicinity. Please stay tuned for updates and follow safety protocols.";
        alert.urgency = 'high';
        alert.action = 'emergency_response';
        break;
      default:
        alert.message = "Environmental update: New information available for your area.";
    }

    return alert;
  }

  /**
   * Generate educational content
   */
  generateEducationalContent(topic) {
    const content = {
      pollution: {
        title: "Understanding Air Pollution",
        content: "Air pollution comes from various sources including vehicles, industry, and natural events. Common pollutants include PM2.5, PM10, nitrogen oxides, and ozone. Monitoring helps protect public health and guide policy decisions.",
        tips: ["Check AQI daily", "Limit outdoor exercise on high pollution days", "Use air purifiers indoors", "Support clean energy initiatives"]
      },
      climate: {
        title: "Climate Change Basics",
        content: "Climate change refers to long-term shifts in global temperatures and weather patterns. Human activities, particularly fossil fuel burning, are the primary driver. Effects include rising temperatures, extreme weather, and ecosystem disruption.",
        tips: ["Reduce carbon footprint", "Support renewable energy", "Conserve energy", "Plant trees"]
      },
      emergency: {
        title: "Environmental Emergency Preparedness",
        content: "Environmental emergencies include natural disasters, industrial accidents, and pollution events. Being prepared with emergency kits, evacuation plans, and communication methods can save lives.",
        tips: ["Create emergency kit", "Know evacuation routes", "Stay informed", "Help neighbors"]
      }
    };

    return content[topic] || {
      title: "Environmental Intelligence",
      content: "Environmental monitoring helps us understand and respond to changes in our natural world. Data-driven insights enable better decision-making for public safety and ecosystem health.",
      tips: ["Stay informed", "Take action locally", "Support environmental initiatives", "Educate others"]
    };
  }

  /**
   * Get guide agent statistics
   */
  getGuideStats() {
    return {
      responseCategories: Object.keys(this.responseCategories).length,
      personality: this.personality,
      capabilities: ['weather', 'environment', 'emergency', 'education', 'assistance']
    };
  }
}

export default new GuideAgent();
