import 'dotenv/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useStaticAssets(join(process.cwd(), 'downloads'), {
    prefix: '/downloads/',
  });

  const config = new DocumentBuilder()
    .setTitle('API Pizzatto Infra')
    .setDescription('Documentação da API Pizzatto Infra')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`Application running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error(error, '', 'Bootstrap');
  process.exit(1);
});