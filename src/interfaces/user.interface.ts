export interface User {
  id: string;
  name: string;
  username: string;
}

export interface UserWithFollowers extends User {
  followers: number;
}

export interface UserFollowersDiff extends User {
  difference: number;
}
