import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PoliticasAceitesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: any, ip: string, user: any) {
    const create = await this.prisma.politicaAceites.create({
      data: {
        colaborador: user?.name,
        politicaId: body.politicaId,
        dataAceite: new Date().toISOString(),
      },
      include: {
        Politicas: true,
      },
    });

    await this.prisma.audit_logs.create({
      data: {
        acao: `Criou o aceite na Politica ${create.Politicas?.nome}`,
        entidade: user?.name,
        filialEntidade: user?.company,
        ipAddress: ip,
      },
    });
  }

  async findAceitesByIdPoliticas(id: string) {
    return await this.prisma.politicaAceites.findMany({
      where: { politicaId: id },
    });
  }
}
