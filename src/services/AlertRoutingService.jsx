// Alert Routing Service for Nigerian Emergency Response
class AlertRoutingService {
  constructor() {
    this.authorities = {
      // National Emergency Management
      NEMA: {
        name: "National Emergency Management Agency",
        priority: 1,
        contact: {
          phone: "+234-800-6362-0000",
          email: "ops@nema.gov.ng",
          hotline: "0800-6362-0000"
        },
        jurisdiction: "national",
        responseTypes: ["disaster", "emergency", "critical"],
        capabilities: ["coordination", "logistics", "evacuation", "relief"]
      },
      
      // Federal Emergency Management
      FEMA: {
        name: "Federal Emergency Management Agency",
        priority: 2,
        contact: {
          phone: "+234-800-3362-0000",
          email: "info@fema.gov.ng",
          hotline: "0800-3362-0000"
        },
        jurisdiction: "federal",
        responseTypes: ["federal_disaster", "infrastructure", "critical"],
        capabilities: ["federal_coordination", "infrastructure", "resources"]
      },
      
      // State Emergency Services
      SEMA: {
        name: "State Emergency Management Agency",
        priority: 3,
        contact: {
          phone: "+234-800-7362-0000",
          email: "state@sema.gov.ng"
        },
        jurisdiction: "state",
        responseTypes: ["state_emergency", "local_disaster"],
        capabilities: ["state_coordination", "local_response", "evacuation"]
      },
      
      // Nigerian Police Force
      NPF: {
        name: "Nigerian Police Force",
        priority: 4,
        contact: {
          phone: "+234-805-700-0000",
          email: "info@npf.gov.ng",
          emergency: "0805-700-0000"
        },
        jurisdiction: "national",
        responseTypes: ["security", "crime", "missing_persons", "terrorism"],
        capabilities: ["law_enforcement", "security", "investigation"]
      },
      
      // Nigerian Red Cross
      REDCROSS: {
        name: "Nigerian Red Cross Society",
        priority: 5,
        contact: {
          phone: "+234-803-721-0000",
          email: "info@redcross.ng",
          hotline: "0800-733-2767"
        },
        jurisdiction: "national",
        responseTypes: ["humanitarian", "medical", "relief", "first_aid"],
        capabilities: ["first_aid", "humanitarian_aid", "medical_response", "shelter"]
      },
      
      // Ministry of Health
      FMOH: {
        name: "Federal Ministry of Health",
        priority: 6,
        contact: {
          phone: "+234-803-721-0000",
          email: "info@health.gov.ng",
          emergency: "0800-946-3000"
        },
        jurisdiction: "national",
        responseTypes: ["health", "epidemic", "medical_emergency"],
        capabilities: ["health_coordination", "epidemic_response", "medical_aid"]
      },
      
      // Environmental NGOs
      NCF: {
        name: "Nigerian Conservation Foundation",
        priority: 7,
        contact: {
          phone: "+234-807-782-7333",
          email: "info@ncfnigeria.org"
        },
        jurisdiction: "national",
        responseTypes: ["environmental", "wildlife", "conservation"],
        capabilities: ["environmental_response", "conservation", "wildlife_rescue"]
      },
      
      // Climate Organizations
      CCDEV: {
        name: "Climate Change Development Centre",
        priority: 8,
        contact: {
          phone: "+234-802-345-6789",
          email: "info@climatechange.org.ng"
        },
        jurisdiction: "national",
        responseTypes: ["climate", "environmental", "sustainability"],
        capabilities: ["climate_response", "environmental_monitoring", "sustainability"]
      }
    };

    this.routingRules = {
      // Critical Events - Immediate National Response
      critical: {
        triggers: ["terrorism", "national_disaster", "mass_casualty", "infrastructure_collapse"],
        authorities: ["NEMA", "FEMA", "NPF", "FMOH"],
        escalation: "immediate",
        response_time: "15_minutes"
      },
      
      // High Priority Events
      high: {
        triggers: ["flood", "fire", "chemical_spill", "building_collapse", "epidemic"],
        authorities: ["NEMA", "SEMA", "REDCROSS", "FMOH"],
        escalation: "30_minutes",
        response_time: "30_minutes"
      },
      
      // Medium Priority Events
      medium: {
        triggers: ["missing_persons", "environmental_incident", "local_emergency"],
        authorities: ["NPF", "REDCROSS", "NCF", "SEMA"],
        escalation: "1_hour",
        response_time: "1_hour"
      },
      
      // Standard Events
      standard: {
        triggers: ["minor_incident", "community_alert", "environmental_concern"],
        authorities: ["NCF", "CCDEV", "SEMA"],
        escalation: "4_hours",
        response_time: "4_hours"
      }
    };
  }

  // Determine alert severity and routing
  analyzeAlert(alert) {
    const severity = this.determineSeverity(alert);
    const authorities = this.getRoutingAuthorities(alert, severity);
    const routingPlan = this.createRoutingPlan(alert, authorities, severity);
    
    return {
      alert,
      severity,
      authorities,
      routingPlan,
      timestamp: new Date().toISOString(),
      estimatedResponseTime: this.getResponseTime(severity)
    };
  }

  // Determine alert severity based on multiple factors
  determineSeverity(alert) {
    const factors = {
      casualties: alert.casualties || 0,
      affectedArea: alert.radius || 0,
      type: alert.type || 'standard',
      infrastructure: alert.infrastructureImpact || false,
      nationalInterest: alert.nationalInterest || false,
      timeSensitive: alert.timeSensitive || false
    };

    // Critical severity triggers
    if (
      factors.casualties > 10 ||
      factors.affectedArea > 50 ||
      factors.infrastructure ||
      factors.nationalInterest ||
      factors.timeSensitive ||
      alert.type === 'terrorism' ||
      alert.type === 'national_disaster'
    ) {
      return 'critical';
    }

    // High severity triggers
    if (
      factors.casualties > 3 ||
      factors.affectedArea > 10 ||
      alert.type === 'flood' ||
      alert.type === 'fire' ||
      alert.type === 'chemical_spill' ||
      alert.type === 'epidemic'
    ) {
      return 'high';
    }

    // Medium severity triggers
    if (
      factors.casualties > 0 ||
      factors.affectedArea > 2 ||
      alert.type === 'missing_persons' ||
      alert.type === 'environmental_incident'
    ) {
      return 'medium';
    }

    return 'standard';
  }

  // Get appropriate authorities based on alert and severity
  getRoutingAuthorities(alert, severity) {
    const rule = this.routingRules[severity];
    const matchedAuthorities = [];

    // Check if alert type matches any triggers
    const alertType = alert.type || 'standard';
    const isTriggered = rule.triggers.some(trigger => 
      alertType.includes(trigger) || 
      alert.category?.includes(trigger) ||
      alert.keywords?.some(keyword => keyword.includes(trigger))
    );

    if (isTriggered || severity === 'critical') {
      // Add primary authorities
      rule.authorities.forEach(acronym => {
        if (this.authorities[acronym]) {
          matchedAuthorities.push({
            ...this.authorities[acronym],
            acronym,
            priority: this.authorities[acronym].priority,
            role: this.getAuthorityRole(acronym, alert),
            responseCapability: this.checkResponseCapability(acronym, alert)
          });
        }
      });
    }

    // Add location-specific authorities
    if (alert.location) {
      const locationAuthorities = this.getLocationBasedAuthorities(alert.location);
      matchedAuthorities.push(...locationAuthorities);
    }

    // Sort by priority
    return matchedAuthorities.sort((a, b) => a.priority - b.priority);
  }

  // Get authority role based on alert type
  getAuthorityRole(acronym, alert) {
    const roles = {
      NEMA: "Primary Coordinator",
      FEMA: "Federal Support",
      NPF: "Security Response",
      REDCROSS: "Humanitarian Aid",
      FMOH: "Medical Response",
      SEMA: "State Coordination",
      NCF: "Environmental Response",
      CCDEV: "Climate Response"
    };

    return roles[acronym] || "Support Agency";
  }

  // Check if authority can handle this alert type
  checkResponseCapability(acronym, alert) {
    const authority = this.authorities[acronym];
    if (!authority) return false;

    const alertCategory = alert.category || alert.type || 'standard';
    return authority.responseTypes.some(type => 
      alertCategory.includes(type) || 
      type.includes(alertCategory)
    );
  }

  // Get location-based authorities
  getLocationBasedAuthorities(location) {
    // Simplified location-based routing
    // In production, this would use geolocation to determine state/region
    const stateAuthorities = {
      "Lagos": ["SEMA", "NPF"],
      "Abuja": ["NEMA", "FEMA", "NPF"],
      "Port Harcourt": ["SEMA", "NCF"],
      "Kano": ["SEMA", "REDCROSS"]
    };

    const locationKey = Object.keys(stateAuthorities).find(key => 
      location.includes(key)
    );

    if (locationKey) {
      return stateAuthorities[locationKey].map(acronym => ({
        ...this.authorities[acronym],
        acronym,
        priority: this.authorities[acronym].priority + 10, // Lower priority than national
        role: "Local Response",
        responseCapability: true
      }));
    }

    return [];
  }

  // Create comprehensive routing plan
  createRoutingPlan(alert, authorities, severity) {
    const plan = {
      primary: [],
      secondary: [],
      notification: [],
      escalation: []
    };

    authorities.forEach((authority, index) => {
      const authorityPlan = {
        authority: authority.name,
        acronym: authority.acronym,
        contact: authority.contact,
        role: authority.role,
        priority: authority.priority,
        responseTime: this.getAuthorityResponseTime(authority.acronym, severity),
        capabilities: authority.capabilities,
        actions: this.getRecommendedActions(authority.acronym, alert)
      };

      // Categorize authorities
      if (index === 0) {
        plan.primary.push(authorityPlan);
      } else if (index <= 2) {
        plan.secondary.push(authorityPlan);
      } else if (index <= 4) {
        plan.notification.push(authorityPlan);
      } else {
        plan.escalation.push(authorityPlan);
      }
    });

    return plan;
  }

  // Get authority-specific response time
  getAuthorityResponseTime(acronym, severity) {
    const baseTimes = {
      critical: { NEMA: "15min", FEMA: "30min", NPF: "10min", REDCROSS: "20min" },
      high: { NEMA: "30min", SEMA: "45min", REDCROSS: "1hr", FMOH: "45min" },
      medium: { NPF: "1hr", REDCROSS: "2hr", SEMA: "2hr", NCF: "4hr" },
      standard: { NCF: "4hr", CCDEV: "8hr", SEMA: "6hr" }
    };

    return baseTimes[severity]?.[acronym] || "2hr";
  }

  // Get recommended actions for each authority
  getRecommendedActions(acronym, alert) {
    const actionMap = {
      NEMA: ["Coordinate response", "Deploy resources", "Evacuation planning", "Public communication"],
      FEMA: ["Federal support coordination", "Infrastructure assessment", "Resource mobilization"],
      NPF: ["Security perimeter", "Crowd control", "Investigation", "Traffic management"],
      REDCROSS: ["First aid stations", "Shelter management", "Humanitarian aid", "Volunteer coordination"],
      FMOH: ["Medical response", "Epidemic monitoring", "Health advisory", "Hospital coordination"],
      SEMA: ["State coordination", "Local resources", "Evacuation support", "Damage assessment"],
      NCF: ["Environmental assessment", "Wildlife protection", "Habitat restoration"],
      CCDEV: ["Climate impact assessment", "Environmental monitoring", "Sustainability measures"]
    };

    return actionMap[acronym] || ["Assist primary response", "Provide specialized support"];
  }

  // Get overall response time estimate
  getResponseTime(severity) {
    const times = {
      critical: "15-30 minutes",
      high: "30-60 minutes",
      medium: "1-2 hours",
      standard: "2-6 hours"
    };

    return times[severity] || "2-6 hours";
  }

  // Execute routing - send notifications to authorities
  async executeRouting(routingPlan) {
    const notifications = [];

    // Notify primary authorities immediately
    for (const authority of routingPlan.primary) {
      const notification = await this.sendNotification(authority, 'immediate');
      notifications.push(notification);
    }

    // Notify secondary authorities within 5 minutes
    setTimeout(async () => {
      for (const authority of routingPlan.secondary) {
        const notification = await this.sendNotification(authority, 'urgent');
        notifications.push(notification);
      }
    }, 5 * 60 * 1000);

    // Notify notification authorities within 15 minutes
    setTimeout(async () => {
      for (const authority of routingPlan.notification) {
        const notification = await this.sendNotification(authority, 'standard');
        notifications.push(notification);
      }
    }, 15 * 60 * 1000);

    return notifications;
  }

  // Send notification to authority
  async sendNotification(authority, priority) {
    // In production, this would integrate with actual notification systems
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      authority: authority.authority,
      contact: authority.contact,
      priority,
      timestamp: new Date().toISOString(),
      status: 'sent',
      estimatedDelivery: priority === 'immediate' ? '1 minute' : '5 minutes'
    };

    console.log(`Notification sent to ${authority.authority}:`, notification);
    return notification;
  }

  // Get routing status for an alert
  getRoutingStatus(alertId) {
    // In production, this would query the database
    return {
      alertId,
      status: 'active',
      authoritiesNotified: 5,
      responsesReceived: 2,
      estimatedArrival: '15 minutes',
      lastUpdate: new Date().toISOString()
    };
  }
}

export default AlertRoutingService;
