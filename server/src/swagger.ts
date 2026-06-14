import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SafeTrack API',
      version: '1.0.0',
      description: 'API documentation for the SafeTrack family tracking application.',
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Local server (API)',
      },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
        },
        childTokenAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Bearer token for tracker authentication if used, or pass in socket auth.',
        },
      },
    },
    security: [{ cookieAuth: [] }],
  },
  // Path to the API docs
  apis: ['./src/routes/*.ts'], // Assumes routes are in the routes folder
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Application) {
  // Swagger Page
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SafeTrack API Docs'
  }));

  // Docs in JSON format
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('Swagger Docs available at http://localhost:3001/api-docs');
}
