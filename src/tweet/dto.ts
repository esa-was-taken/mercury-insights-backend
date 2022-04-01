import { IsDate } from 'class-validator';

export class BeforeDateDto {
  @IsDate()
  before: Date;
}
