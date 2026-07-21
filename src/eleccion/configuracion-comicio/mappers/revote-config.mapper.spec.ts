import { PoliticaRevoto } from '@/eleccion/configuracion-comicio/enums/politica-revoto.enum';
import { ConfiguracionComicio } from '@/eleccion/configuracion-comicio/entities/configuracion-comicio.entity';
import { mapConfiguracionToRevoteConfig } from '@/eleccion/configuracion-comicio/mappers/revote-config.mapper';

describe('mapConfiguracionToRevoteConfig (VOTAR-323)', () => {
  const baseConfig = (): ConfiguracionComicio =>
    ({
      idEleccion: 1,
      permitirVotoMultiple: false,
      maxVotosPorVotante: 1,
      minIntervaloSegundos: 0,
      politicaRevoto: PoliticaRevoto.DISABLED,
    }) as ConfiguracionComicio;

  it('maps enabled=false when re-voto is disabled', () => {
    const actual = mapConfiguracionToRevoteConfig(baseConfig());
    expect(actual).toEqual({
      enabled: false,
      maxVotesPerVoter: 1,
      minIntervalSeconds: 0,
      policy: 0,
    });
  });

  it('maps enabled=true when permitirVotoMultiple and LAST_VOTE_WINS', () => {
    const config = baseConfig();
    config.permitirVotoMultiple = true;
    config.politicaRevoto = PoliticaRevoto.LAST_VOTE_WINS;
    config.maxVotosPorVotante = 3;
    config.minIntervaloSegundos = 60;
    const actual = mapConfiguracionToRevoteConfig(config);
    expect(actual.enabled).toBe(true);
    expect(actual.maxVotesPerVoter).toBe(3);
    expect(actual.minIntervalSeconds).toBe(60);
  });
});
