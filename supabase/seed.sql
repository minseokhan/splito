-- 로컬 개발 전용. 운영 키는 Vault에 별도로 만든다(마이그레이션·코드에 넣지 않는다).
select vault.create_secret('dev-only-key', 'payout_account_key');
