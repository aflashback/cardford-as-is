import type { Seat, TrixObservation } from '../../../shared/local-service.contracts.ts';
import { cardLabel } from '../../api/display';
import { CardFace, playerNames } from '../../table/CardPrimitives';
import { seatTwoAnnouncements } from './adapter.ts';

/** Presentation only: neither hidden card IDs nor a client reveal clock are needed. */
export function TwoAnnouncements({ observation, seat }: { observation: TrixObservation; seat: Seat }) {
  const announcement = seatTwoAnnouncements(observation, seat);
  if (!announcement) return null;
  const owner = seat === 0 ? 'Your' : `${playerNames[seat]}’s`;
  if (announcement.status === 'hidden') {
    if (!announcement.count) return null;
    return (
      <div
        className="announced-cards trix-two-announcements"
        role="img"
        data-state="hidden"
        aria-label={`${owner} ${announcement.count} announced ${announcement.count === 1 ? 'two' : 'twos'}, face down`}
      >
        {Array.from({ length: announcement.count }, (_, index) => (
          <span key={index} className="count-card-back announced-two-back" aria-hidden="true" />
        ))}
      </div>
    );
  }
  if (!announcement.cards.length) return null;
  return (
    <div
      className="announced-cards trix-two-announcements"
      role="group"
      data-state="revealed"
      aria-label={`${owner} announced twos`}
    >
      {announcement.cards.map((card) => (
        <span key={card} role="img" aria-label={`Announced ${cardLabel(card)}`}>
          <CardFace card={card} />
        </span>
      ))}
    </div>
  );
}
