#!/bin/bash
set -e

echo "🛠️  PHASE 2: IMPLEMENTING PROPERTY CODECS..."

# ---------------------------------------------------------
# 1. Create the Codec Registry
# ---------------------------------------------------------
echo "📝 Creating src/modules/graph-core/property-codecs.ts..."

cat << 'TS_CODECS' > src/modules/graph-core/property-codecs.ts
/**
 * Property Codecs
 * * Middleware to translate complex nested objects into flat, queryable scalars
 * for FalkorDB, and reconstruct them upon retrieval.
 */

interface PropertyCodec {
  encode: (props: Record<string, any>) => Record<string, any>;
  decode: (props: Record<string, any>) => Record<string, any>;
}

// ----------------------------------------------------------------------
// FLATTENING LOGIC
// ----------------------------------------------------------------------

const StandardCodec: PropertyCodec = {
  encode: (props) => {
    const flattened: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(props)) {
      if (!value) {
        flattened[key] = value;
        continue;
      }

      // Detect: AmountRange { min, max, currency }
      if (key === 'amount' && typeof value === 'object' && ('min' in value || 'max' in value)) {
        if (value.min !== undefined) flattened['amountMin'] = value.min;
        if (value.max !== undefined) flattened['amountMax'] = value.max;
        if (value.currency) flattened['amountCurrency'] = value.currency;
        continue; // Skip original object
      }

      // Detect: GeoLocation { lat, lng, address }
      if (key === 'location' && typeof value === 'object' && ('lat' in value || 'lng' in value)) {
        if (value.lat !== undefined) flattened['locationLat'] = value.lat;
        if (value.lng !== undefined) flattened['locationLng'] = value.lng;
        if (value.state) flattened['locationState'] = value.state;
        continue; 
      }

      // Detect: TimeCommitment { hours, duration }
      if (key === 'commitment' && typeof value === 'object') {
        if (value.hoursMin !== undefined) flattened['commitmentHoursMin'] = value.hoursMin;
        if (value.hoursMax !== undefined) flattened['commitmentHoursMax'] = value.hoursMax;
        continue;
      }

      // Passthrough for everything else (Arrays are handled by CRUD)
      flattened[key] = value;
    }
    return flattened;
  },

  decode: (props) => {
    const reconstructed: Record<string, any> = { ...props };

    // Reconstruct Amount
    if ('amountMin' in props || 'amountMax' in props) {
      reconstructed['amount'] = {
        min: props['amountMin'],
        max: props['amountMax'],
        currency: props['amountCurrency']
      };
      // Cleanup scalars from the object view
      delete reconstructed['amountMin'];
      delete reconstructed['amountMax'];
      delete reconstructed['amountCurrency'];
    }

    // Reconstruct Location
    if ('locationLat' in props || 'locationLng' in props) {
      reconstructed['location'] = {
        lat: props['locationLat'],
        lng: props['locationLng'],
        state: props['locationState']
      };
      delete reconstructed['locationLat'];
      delete reconstructed['locationLng'];
      delete reconstructed['locationState'];
    }

    return reconstructed;
  }
};

// ----------------------------------------------------------------------
// REGISTRY
// ----------------------------------------------------------------------

export const CodecRegistry = {
  // Currently applying the same standard flattening to key Node Types
  getCodec: (label: string): PropertyCodec => {
    return StandardCodec; 
  }
};
TS_CODECS

# ---------------------------------------------------------
# 2. Wire Codecs into NodeCrud
# ---------------------------------------------------------
echo "📝 Wiring Codecs into src/modules/graph-core/crud.ts..."

cat << 'TS_CRUD' > src/modules/graph-core/crud.ts
import { GraphConnection } from './connection';
import { CodecRegistry } from './property-codecs';

export class NodeCrud {
  constructor(private connection: GraphConnection) {}

  /**
   * Serialize properties for FalkorDB storage.
   * PIPELINE: 
   * 1. Run Codec (Flatten Objects -> Scalars)
   * 2. Serialize Primitives (Dates -> ISO, etc.)
   */
  private serializeProperties(label: string, props: Record<string, any>): Record<string, any> {
    // A) Apply Flattening Codec
    const codec = CodecRegistry.getCodec(label);
    const flattened = codec.encode(props);

    // B) Prepare for Storage (FalkorDB native types)
    const serialized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(flattened)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        // Native Array Support
        serialized[key] = value;
      } else if (value instanceof Date) {
        serialized[key] = value.toISOString();
      } else if (typeof value === 'object') {
        // Fallback: If codec didn't flatten it, stringify it to avoid crashes
        serialized[key] = JSON.stringify(value);
      } else {
        // Primitives
        serialized[key] = value;
      }
    }
    return serialized;
  }

  async createNode(label: string, properties: Record<string, any>): Promise<string> {
    const query = \`CREATE (n:\${label}) SET n = \$props RETURN n.id as id\`;
    // Pass label to serializeProperties so it picks the right codec
    const params = { props: this.serializeProperties(label, properties) };
    
    const result = await this.connection.execute(query, params);
    return result[0]['id']; 
  }

  async updateNode(id: string, properties: Record<string, any>): Promise<void> {
    // We assume generic codec if we don't know the label on update, 
    // OR we fetch first. For performance, we use the StandardCodec blindly for now.
    // Ideally, updateNode should take a label or we infer it.
    // For this MVP, we use 'Generic' label trigger.
    const params = { 
      id, 
      props: this.serializeProperties('Generic', properties) 
    };
    const query = \`MATCH (n) WHERE n.id = \$id SET n += \$props\`;
    await this.connection.execute(query, params);
  }

  async getNode(id: string): Promise<Record<string, any> | null> {
    const query = \`MATCH (n) WHERE n.id = \$id RETURN n\`;
    const result = await this.connection.execute(query, { id });
    
    if (result.length === 0) return null;
    
    // Deserialize Logic
    const rawProps = result[0]['n'].properties;
    const deserialized = this.deserializePrimitives(rawProps);
    
    // Apply Decoding (Rehydrate Objects)
    // Note: We don't have the label here easily unless we query 'labels(n)'.
    // For now, StandardCodec is universal.
    return CodecRegistry.getCodec('Generic').decode(deserialized);
  }

  private deserializePrimitives(props: Record<string, any>): Record<string, any> {
    const deserialized: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
      // Decode fallback JSON strings if they exist
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        try {
          deserialized[key] = JSON.parse(value);
        } catch {
          deserialized[key] = value;
        }
      } else {
        deserialized[key] = value;
      }
    }
    return deserialized;
  }
}
TS_CRUD

echo "✅ Phase 2 Complete: Codecs are active."
