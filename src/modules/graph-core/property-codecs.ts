interface PropertyCodec {
  encode: (props: Record<string, any>) => Record<string, any>;
  decode: (props: Record<string, any>) => Record<string, any>;
}

const StandardCodec: PropertyCodec = {
  encode: (props) => {
    const flattened: Record<string, any> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!value) { flattened[key] = value; continue; }

      // Flatten AmountRange
      if (key === 'amount' && typeof value === 'object' && ('min' in value || 'max' in value)) {
        if (value.min !== undefined) flattened['amountMin'] = value.min;
        if (value.max !== undefined) flattened['amountMax'] = value.max;
        if (value.currency) flattened['amountCurrency'] = value.currency;
        continue;
      }
      // Flatten GeoLocation
      if (key === 'location' && typeof value === 'object' && ('lat' in value || 'lng' in value)) {
        if (value.lat !== undefined) flattened['locationLat'] = value.lat;
        if (value.lng !== undefined) flattened['locationLng'] = value.lng;
        if (value.state) flattened['locationState'] = value.state;
        continue; 
      }
      flattened[key] = value;
    }
    return flattened;
  },

  decode: (props) => {
    const reconstructed: Record<string, any> = { ...props };
    // Rehydrate Amount
    if ('amountMin' in props || 'amountMax' in props) {
      reconstructed['amount'] = {
        min: props['amountMin'],
        max: props['amountMax'],
        currency: props['amountCurrency']
      };
      delete reconstructed['amountMin'];
      delete reconstructed['amountMax'];
      delete reconstructed['amountCurrency'];
    }
    // Rehydrate Location
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

export const CodecRegistry = {
  getCodec: (label: string): PropertyCodec => { return StandardCodec; }
};