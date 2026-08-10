export type RevoteOverwriteTimelinePoint = {
  etiqueta: string;
  overwriteRatio: number;
  totalRevotes: number;
  totalEventos: number;
};

export type RevoteStatsFromIndex = {
  totalRevotes: number;
  uniqueVoters: number;
  overwriteRatio: number;
};

type IndexedVoteEvent = {
  timestampMs: number;
  isRevote: boolean;
};

export function isIndexedVoteTransaction(row: {
  nombreEvento: string;
  descripcionLegible: string;
}): boolean {
  if (row.descripcionLegible.includes('Sufragio contabilizado')) {
    return true;
  }
  return /SignedVoteCast|VoteCast/.test(row.nombreEvento);
}

export function isIndexedRevote(row: { descripcionLegible: string }): boolean {
  return row.descripcionLegible.includes('Re-voto registrado');
}

/**
 * Same aggregates as VoteRegistry.getRevoteStats, derived from the VOTAR-373 index.
 * Used when AuditView predates getRevoteStats (non-upgradeable Sepolia deployments).
 */
export function buildRevoteStatsFromIndexedVotes(
  voteEvents: Array<{ isRevote: boolean }>,
): RevoteStatsFromIndex {
  let totalRevotes = 0;
  let uniqueVoters = 0;
  for (const event of voteEvents) {
    if (event.isRevote) {
      totalRevotes += 1;
    } else {
      uniqueVoters += 1;
    }
  }
  const totalEvents = uniqueVoters + totalRevotes;
  return {
    totalRevotes,
    uniqueVoters,
    overwriteRatio: totalEvents === 0 ? 0 : totalRevotes / totalEvents,
  };
}

/**
 * VOTAR-329 + VOTAR-373 — hourly cumulative overwrite ratio from indexed vote txs.
 */
export function buildRevoteOverwriteTimelineFromIndexedVotes(
  voteEvents: IndexedVoteEvent[],
  horasVentana: number,
): RevoteOverwriteTimelinePoint[] {
  const hours = Math.max(1, Math.min(72, Math.floor(horasVentana)));
  const sortedEvents = [...voteEvents].sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  const nowMs = Date.now();
  const windowStartMs = nowMs - hours * 60 * 60 * 1000;
  const bucketCount = hours;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = windowStartMs + index * 60 * 60 * 1000;
    return { startMs, endMs: startMs + 60 * 60 * 1000 };
  });

  let revotesBeforeWindow = 0;
  let eventsBeforeWindow = 0;
  for (const event of sortedEvents) {
    if (event.timestampMs >= windowStartMs) {
      break;
    }
    eventsBeforeWindow += 1;
    if (event.isRevote) {
      revotesBeforeWindow += 1;
    }
  }

  return buckets.map((bucket) => {
    let cumulativeRevotes = revotesBeforeWindow;
    let cumulativeEvents = eventsBeforeWindow;

    for (const event of sortedEvents) {
      if (event.timestampMs < windowStartMs) {
        continue;
      }
      if (event.timestampMs >= bucket.endMs) {
        break;
      }
      cumulativeEvents += 1;
      if (event.isRevote) {
        cumulativeRevotes += 1;
      }
    }

    const overwriteRatio =
      cumulativeEvents === 0
        ? 0
        : Math.round((cumulativeRevotes / cumulativeEvents) * 1000) / 1000;

    const date = new Date(bucket.startMs);
    const etiqueta = date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires',
    });

    return {
      etiqueta,
      overwriteRatio,
      totalRevotes: cumulativeRevotes,
      totalEventos: cumulativeEvents,
    };
  });
}
