export interface User {
  id: string;
  name: string;
  username: string;

  marked: boolean;
  metadata?: UserMetadata;
  public_metrics?: UserPublicMetrics;
}

export interface UserMetadata {
  createdAt?: Date;
  description?: string;
  entities?: string;
  location?: string;
  pinned_tweet_id?: string;
  profile_image_url?: string;
  protected?: boolean;
  url?: string;
  verified?: boolean;
}

export interface UserPublicMetrics {
  followers_count?: number;
  following_count?: number;
  tweet_count?: number;
  listed_count?: number;
}

export interface UserWithFollowers extends User {
  followers: number;
}

export interface UserFollowersDiff extends UserWithFollowers {
  difference: number;
}
