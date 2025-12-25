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
