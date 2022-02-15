import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TwitterUser } from './twitter_user';

@Entity({ name: 'twitter_relationship' })
export class TwitterRelationship {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => TwitterUser, (user) => user.following)
  from!: TwitterUser;

  @ManyToOne(() => TwitterUser, (user) => user.followers)
  to!: TwitterUser;

  @Index()
  @Column()
  is_removed!: boolean;

  @Index()
  @CreateDateColumn()
  created_at!: Date;
}
