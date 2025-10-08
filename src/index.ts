import { App, config, Namespace, PersistentVolumeClaim, Secret } from '@homelab/shared'

const cfg = config('mongodb')
const ns = cfg.get('namespace', 'mongodb')

// Create namespace
const namespace = new Namespace('mongodb', {
  metadata: {
    name: ns,
  },
})

// MongoDB credentials secret
const mongodbSecret = new Secret(
  'mongodb-secret',
  {
    metadata: {
      name: 'mongodb-secret',
      namespace: ns,
    },
    type: 'Opaque',
    stringData: {
      MONGO_INITDB_ROOT_USERNAME: process.env.MONGODB_ROOT_USERNAME || 'admin',
      MONGO_INITDB_ROOT_PASSWORD: process.env.MONGODB_ROOT_PASSWORD || 'changeme',
    },
  },
  { dependsOn: [namespace] },
)

// MongoDB PVC for data persistence
const mongodbPVC = new PersistentVolumeClaim(
  'mongodb-data',
  {
    metadata: {
      name: 'mongodb-data',
      namespace: ns,
    },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: cfg.get('storageClass', 'truenas-hdd-mirror-nfs'),
      resources: {
        requests: {
          storage: cfg.get('dataSize', '20Gi'),
        },
      },
    },
  },
  { dependsOn: [namespace] },
)

// MongoDB App - Using official mongo Docker image
const mongodb = new App(
  'mongodb',
  {
    namespace: ns,
    image: process.env.MONGODB_IMAGE || 'mongo:7.0',
    ports: [{ name: 'mongodb', containerPort: 27017, servicePort: 27017 }],
    env: [
      {
        name: 'MONGO_INITDB_ROOT_USERNAME',
        valueFrom: {
          secretKeyRef: {
            name: 'mongodb-secret',
            key: 'MONGO_INITDB_ROOT_USERNAME',
          },
        },
      },
      {
        name: 'MONGO_INITDB_ROOT_PASSWORD',
        valueFrom: {
          secretKeyRef: {
            name: 'mongodb-secret',
            key: 'MONGO_INITDB_ROOT_PASSWORD',
          },
        },
      },
    ],
    volumeMounts: [
      {
        name: 'data',
        mountPath: '/data/db',
      },
    ],
    volumes: [
      {
        name: 'data',
        type: 'pvc',
        source: 'mongodb-data',
      },
    ],
    resources: {
      requests: {
        cpu: cfg.get('cpu', '500m'),
        memory: cfg.get('memory', '1Gi'),
      },
      limits: {
        cpu: cfg.get('cpuLimit', '2'),
        memory: cfg.get('memoryLimit', '2Gi'),
      },
    },
    serviceType: 'ClusterIP',
  },
  { dependsOn: [namespace, mongodbSecret, mongodbPVC] },
)

// MongoDB connection secret for Mongo Express
const mongoExpressSecret = new Secret(
  'mongo-express-secret',
  {
    metadata: {
      name: 'mongo-express-secret',
      namespace: ns,
    },
    stringData: {
      ME_CONFIG_MONGODB_ADMINUSERNAME: process.env.MONGODB_ROOT_USERNAME || 'admin',
      ME_CONFIG_MONGODB_ADMINPASSWORD: process.env.MONGODB_ROOT_PASSWORD || 'changeme',
      ME_CONFIG_BASICAUTH_USERNAME: process.env.MONGO_EXPRESS_USERNAME || 'admin',
      ME_CONFIG_BASICAUTH_PASSWORD: process.env.MONGO_EXPRESS_PASSWORD || 'changeme',
    },
  },
  { dependsOn: [namespace] },
)

// Mongo Express deployment
const mongoExpress = new App(
  'mongo-express',
  {
    namespace: ns,
    image: process.env.MONGO_EXPRESS_IMAGE || 'mongo-express:1.0.2',
    ports: [{ name: 'http', containerPort: 8081, servicePort: 8081 }],
    env: [
      {
        name: 'ME_CONFIG_MONGODB_SERVER',
        value: 'mongodb',
      },
      {
        name: 'ME_CONFIG_MONGODB_PORT',
        value: '27017',
      },
      {
        name: 'ME_CONFIG_MONGODB_ENABLE_ADMIN',
        value: 'true',
      },
      {
        name: 'ME_CONFIG_BASICAUTH',
        value: cfg.get('basicAuthEnabled', 'true'),
      },
      {
        name: 'ME_CONFIG_MONGODB_ADMINUSERNAME',
        valueFrom: {
          secretKeyRef: {
            name: 'mongo-express-secret',
            key: 'ME_CONFIG_MONGODB_ADMINUSERNAME',
          },
        },
      },
      {
        name: 'ME_CONFIG_MONGODB_ADMINPASSWORD',
        valueFrom: {
          secretKeyRef: {
            name: 'mongo-express-secret',
            key: 'ME_CONFIG_MONGODB_ADMINPASSWORD',
          },
        },
      },
      {
        name: 'ME_CONFIG_BASICAUTH_USERNAME',
        valueFrom: {
          secretKeyRef: {
            name: 'mongo-express-secret',
            key: 'ME_CONFIG_BASICAUTH_USERNAME',
          },
        },
      },
      {
        name: 'ME_CONFIG_BASICAUTH_PASSWORD',
        valueFrom: {
          secretKeyRef: {
            name: 'mongo-express-secret',
            key: 'ME_CONFIG_BASICAUTH_PASSWORD',
          },
        },
      },
    ],
    resources: {
      requests: { cpu: '100m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '256Mi' },
    },
    serviceType: 'LoadBalancer',
  },
  { dependsOn: [mongodb, mongoExpressSecret] },
)

export const namespaceExport = namespace.metadata.name
export const services = {
  mongodb: mongodb.service?.metadata.name,
  mongoExpress: mongoExpress.service?.metadata.name,
}
