import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';

/** On-chain RevoteConfig tuple for ElectionFactory.createElection (VOTAR-323). */
export type RevoteConfigOnChain = {
  enabled: boolean;
  maxVotesPerVoter: number;
  minIntervalSeconds: number;
  policy: number;
};

export const mapConfiguracionToRevoteConfig = (
  config: ConfiguracionComicio,
): RevoteConfigOnChain => ({
  enabled:
    config.permitirVotoMultiple &&
    config.politicaRevoto === PoliticaRevoto.LAST_VOTE_WINS,
  maxVotesPerVoter: config.maxVotosPorVotante,
  minIntervalSeconds: config.minIntervaloSegundos,
  policy: 0,
});
