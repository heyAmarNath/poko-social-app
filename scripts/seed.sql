-- Seed data. Default admin PIN is 0000: change it right after first login.
-- The admin only manages people, accounts and platforms; add members to write content.
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('x','X',280,'[]','#111827',0);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('facebook','Facebook',63206,'[]','#1877f2',1);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('instagram','Instagram',2200,'[]','#e1306c',2);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('linkedin','LinkedIn',3000,'[]','#0a66c2',3);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('reddit','Reddit',40000,'[{"key":"subreddit","label":"Subreddit"},{"key":"title","label":"Post title"}]','#ff4500',4);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('discord','Discord',2000,'[{"key":"server","label":"Server"},{"key":"channel","label":"Channel"}]','#5865f2',5);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('threads','Threads',500,'[]','#000000',6);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('tiktok','TikTok',2200,'[]','#25f4ee',7);
INSERT INTO platforms (key,name,char_limit,extra_fields,color,sort) VALUES ('youtube','YouTube',5000,'[{"key":"title","label":"Video title"}]','#ff0000',8);
INSERT INTO profiles (name,avatar_color,pin_hash,pin_salt,role,created_at) VALUES ('Admin','#6366f1','ba45dc86a43460f99e0c890bb06b151871cc6f0c9dc809a27f27a7ceaa84a731','5366660ef1145fd8622a03e06b094507','admin',1792413906878);
