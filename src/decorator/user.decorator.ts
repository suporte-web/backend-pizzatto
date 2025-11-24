import {
  createParamDecorator,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';

export const User = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    if (request.user) {
      // Converte o documento Mongoose para objeto JavaScript simples
      const user = request.user._doc ? request.user._doc : request.user;
      
      // Remove a senha do objeto retornado (opcional, mas recomendado)
      const { senha, ...userWithoutPassword } = user;
      
      return userWithoutPassword;
    } else {
      throw new NotFoundException(
        'Usuário não encontrado no request. Use o Auth Guard para obter os dados do usuario',
      );
    }
  },
);