import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';

/** VOTAR-323: re-voto requiere al menos voto inicial + una modificación. */
const MIN_SUFRAGIOS_CON_REVOTO = 2;

/** On-chain RevoteConfig tuple for ElectionFactory.createElection (VOTAR-323). */
export type RevoteConfigOnChain = {
  enabled: boolean;
  maxVotesPerVoter: number;
  minIntervalSeconds: number;
  policy: number;
};

export const mapConfiguracionToRevoteConfig = (
  config: ConfiguracionComicio,
): RevoteConfigOnChain => {
  const enabled =
    config.permitirVotoMultiple &&
    config.politicaRevoto === PoliticaRevoto.LAST_VOTE_WINS;
  return {
    enabled,
    maxVotesPerVoter: enabled
      ? Math.max(MIN_SUFRAGIOS_CON_REVOTO, config.maxVotosPorVotante)
      : 1,
    minIntervalSeconds: config.minIntervaloSegundos,
    policy: 0,
  };
};
