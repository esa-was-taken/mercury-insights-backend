import { LargeNumberLike } from 'crypto';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from 'typeorm';
import { TwitterRelationship } from './twitter_relationship';

@Entity({ name: 'twitter_user' })
export class TwitterUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @PrimaryColumn()
  twitter_id?: string;

  @Column()
  twitter_name?: string;

  @Column()
  twitter_username?: string;

  @Index()
  @Column()
  is_watched!: boolean;

  @OneToMany(() => TwitterRelationship, (twitterFriend) => twitterFriend.from)
  following: TwitterRelationship[];

  @OneToMany(() => TwitterRelationship, (twitterFriend) => twitterFriend.to)
  followers: TwitterRelationship[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @Index()
  @Column({ nullable: true })
  scraped_at?: Date;
}
