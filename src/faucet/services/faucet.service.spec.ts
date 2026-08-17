import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { parseEther } from 'ethers';
import { FaucetService } from './faucet.service';
import { MailService, MailOptions } from '@/common/mail/mail.service';

const mockGetBalance = jest.fn();
const mockSendTransaction = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual<typeof import('ethers')>('ethers');
  return {
    ...actual,
    Wallet: jest.fn().mockImplementation(() => ({
      address: '0xMASTERADDRESS',
      sendTransaction: mockSendTransaction,
    })),
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBalance: mockGetBalance,
    })),
  };
});

describe('FaucetService', () => {
  let service: FaucetService;
  let mailService: { sendMail: jest.Mock<Promise<boolean>, [MailOptions]> };
  let balances: Record<string, bigint>;

  const configValues: Record<string, string> = {
    SEPOLIA_RPC_URL: 'https://sepolia.example/rpc',
    FAUCET_MASTER_PRIVATE_KEY: '0xprivatekey',
    TEST_WALLET_ADDRESSES: '0x111,0x222',
    FAUCET_MIN_BALANCE_ETH: '0.1',
    FAUCET_TOPUP_TARGET_ETH: '0.1',
    ALERT_EMAIL_TO: 'auditor@utn.edu.ar',
  };

  beforeEach(async () => {
    mockGetBalance.mockReset();
    mockSendTransaction.mockReset();

    // Estado de balances "on-chain" simulado; sendTransaction lo muta,
    // igual que lo haría una tx real.
    balances = {
      '0xMASTERADDRESS': parseEther('10'),
      '0x111': parseEther('0.02'),
      '0x222': parseEther('0.1'), // ya en el mínimo, no debe tocarse
    };

    mockGetBalance.mockImplementation(
      (address: string) => balances[address] ?? 0n,
    );
    mockSendTransaction.mockImplementation(
      ({ to, value }: { to: string; value: bigint }) => {
        balances['0xMASTERADDRESS'] -= value;
        balances[to] = (balances[to] ?? 0n) + value;
        return {
          hash: '0xTXHASH',
          wait: jest.fn().mockResolvedValue({ hash: '0xTXHASH' }),
        };
      },
    );

    mailService = {
      sendMail: jest
        .fn<Promise<boolean>, [MailOptions]>()
        .mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaucetService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<FaucetService>(FaucetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAndTopUpWallets', () => {
    it('UAT-01: recarga una wallet con 0.02 ETH hasta el mínimo operativo de 0.1 ETH', async () => {
      await service.checkAndTopUpWallets();

      expect(mockSendTransaction).toHaveBeenCalledTimes(1);
      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ to: '0x111' }),
      );
      expect(balances['0x111']).toBe(parseEther('0.1'));
      // 0x222 ya estaba en el mínimo: no se toca
      expect(balances['0x222']).toBe(parseEther('0.1'));
    });

    it('UAT-02: notifica error crítico si el Faucet Maestro no tiene fondos suficientes', async () => {
      balances['0xMASTERADDRESS'] = 0n;

      await service.checkAndTopUpWallets();

      expect(mockSendTransaction).not.toHaveBeenCalled();
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'auditor@utn.edu.ar',
          subject: expect.stringContaining('Faucet Maestro') as string,
        }),
      );
    });

    it('UAT-04: el log detalla el hash de la tx y el balance remanente del faucet', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.checkAndTopUpWallets();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('0xTXHASH'));
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('faucet maestro restante'),
      );

      logSpy.mockRestore();
    });
  });
});
