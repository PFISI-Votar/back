import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { keccak256, recoverAddress, TypedDataEncoder, Wallet } from 'ethers';
import { BlockchainService } from '@/blockchain/blockchain.service';
import {
  buildValidationDomain,
  VALIDATION_EIP712_TYPES,
} from '@/entidad-firmas/lib/validation-typed-data';
import { FirmaInstitucionalService } from '@/entidad-firmas/services/firma-institucional.service';

/**
 * VOTAR-377 — la firma institucional debe (a) recuperar a la address del
 * validador y (b) coincidir con el digest EIP-712 que verifica
 * `BallotContract._assertValidValidatorSignature`.
 */
describe('FirmaInstitucionalService (VOTAR-377)', () => {
  const validatorWallet = Wallet.createRandom();
  const ballotAddress = '0x9BBDaC872c5781532ec32A9b14B906751d5B8C61';
  const CHAIN_ID = 11155111;

  const blockchainService = {
    resolveElectionContracts: jest.fn().mockResolvedValue({
      ballot: ballotAddress,
      voteRegistry: '0x0000000000000000000000000000000000000001',
      auditView: '0x0000000000000000000000000000000000000002',
    }),
    getChainId: jest.fn(() => CHAIN_ID),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'VALIDATOR_PRIVATE_KEY' ? validatorWallet.privateKey : undefined,
    ),
  };

  let service: FirmaInstitucionalService;

  const message = {
    electionId: 377n,
    nullifier: keccak256(Buffer.from('nullifier')),
    selectionHash: keccak256(Buffer.from('selection')),
    candidateId: 101n,
    timestamp: 1_700_000_000n,
    expectedSigner: '0x1234abcd1234abcd1234abcd1234abcd1234abcd',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FirmaInstitucionalService,
        { provide: BlockchainService, useValue: blockchainService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(FirmaInstitucionalService);
  });

  it('firma un payload que recupera a la address de la Entidad de Firmas', async () => {
    const actual = await service.firmarValidacion(377, message);

    expect(actual.direccionValidador).toBe(validatorWallet.address);

    const domain = buildValidationDomain(CHAIN_ID, ballotAddress);
    const digest = TypedDataEncoder.hash(
      domain,
      VALIDATION_EIP712_TYPES,
      message,
    );
    expect(recoverAddress(digest, actual.firmaValidacion)).toBe(
      validatorWallet.address,
    );
  });

  it('el digest firmado usa el dominio EIP-712 del BallotContract de la elección', async () => {
    const actual = await service.firmarValidacion(377, message);

    // Mismo cálculo que BallotContract: keccak(typehash || abi.encode(fields)).
    const expectedDigest = TypedDataEncoder.hash(
      {
        name: 'VOTAR',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: ballotAddress,
      },
      VALIDATION_EIP712_TYPES,
      message,
    );
    expect(recoverAddress(expectedDigest, actual.firmaValidacion)).toBe(
      validatorWallet.address,
    );
    expect(blockchainService.resolveElectionContracts).toHaveBeenCalledWith(
      377,
    );
  });

  it('lanza 503 cuando VALIDATOR_PRIVATE_KEY no está configurada', () => {
    configService.get.mockReturnValueOnce(undefined);
    expect(() => service.obtenerDireccionValidador()).toThrow(
      ServiceUnavailableException,
    );
  });
});
