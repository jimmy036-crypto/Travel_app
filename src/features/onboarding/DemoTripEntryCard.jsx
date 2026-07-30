import React from 'react';

import { TripCard } from '../../components/TripCard.jsx';

export function DemoTripEntryCard({
  trip,
  onOpenDemo,
  onRemove,
  onReset,
}) {
  return (
    <section data-testid="demo-trip-entry-card">
      <TripCard
        trip={trip}
        onOpen={onOpenDemo}
        onRemove={onRemove}
        onReset={onReset}
        titleTestId="example-trip-card-title"
      />
    </section>
  );
}

export default DemoTripEntryCard;
