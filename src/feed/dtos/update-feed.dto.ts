import {
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateFeedDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @IsString({ each: true })
  midiasRemovidas?: string[];

  /*
   * Como vem via multipart/form-data,
   * ordemMidias chega como JSON em string.
   */
  @IsOptional()
  @IsString()
  ordemMidias?: string;
}