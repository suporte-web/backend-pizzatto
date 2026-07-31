import { AuthModule } from '@/auth/auth.module';
import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GestaoDocumentosService } from './gestaoDocumentos.service';
import { GestaoDocumentosController } from './gestaoDocumentos.controller';
import { DocumentoNotificacaoService } from './documentoNotificacao.service';

@Module({
  imports: [AuthModule],
  controllers: [GestaoDocumentosController],
  providers: [
    GestaoDocumentosService,
    PrismaService,
    DocumentoNotificacaoService,
  ],
})
export class GestaoDocumentosModule {}
