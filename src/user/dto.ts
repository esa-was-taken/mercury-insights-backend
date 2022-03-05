import { Transform } from 'class-transformer';
import { IsDate, IsInt } from 'class-validator';

export class PaginateDto {
  @IsInt()
  limit: number;
  @IsInt()
  offset: number;
}

export class IntervalDto extends PaginateDto {
  @IsDate()
  start: Date;
  @IsDate()
  end: Date;
}
