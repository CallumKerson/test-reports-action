# Changelog

## [0.1.1](https://github.com/CallumKerson/test-reports-action/compare/v0.1.0...v0.1.1) (2026-10-04)


### Bug Fixes

* say when reports could not be parsed rather than counting them as tests ([#42](https://github.com/CallumKerson/test-reports-action/issues/42)) ([fbaf266](https://github.com/CallumKerson/test-reports-action/commit/fbaf266a8e5314d80df919253d9b7d53fd2a3bb2))

## 0.1.0 (2026-10-04)


### Features

* find test report files ([#22](https://github.com/CallumKerson/test-reports-action/issues/22)) ([0c3e273](https://github.com/CallumKerson/test-reports-action/commit/0c3e273519f6cd3bb23abfa312fe819d813de217))
* name statuses after the matrix so matrix jobs don't overwrite them ([#33](https://github.com/CallumKerson/test-reports-action/issues/33)) ([2187b63](https://github.com/CallumKerson/test-reports-action/commit/2187b63fa202f2472138f1964a74ce6f04dad564))
* parse Go test JSON reports ([#21](https://github.com/CallumKerson/test-reports-action/issues/21)) ([33b5f91](https://github.com/CallumKerson/test-reports-action/commit/33b5f919707227f373e07b29c3cac9bd2fac5fed))
* parse JUnit XML reports ([#20](https://github.com/CallumKerson/test-reports-action/issues/20)) ([e28e402](https://github.com/CallumKerson/test-reports-action/commit/e28e4020de0a9c4caedeaed50d19331e8a5401d4))
* report test results from discovered files ([#25](https://github.com/CallumKerson/test-reports-action/issues/25)) ([b065d91](https://github.com/CallumKerson/test-reports-action/commit/b065d91ee968b282f32bd7a675f48e8ae3082b38))
* set a commit status for each test report ([#24](https://github.com/CallumKerson/test-reports-action/issues/24)) ([ff614a3](https://github.com/CallumKerson/test-reports-action/commit/ff614a3e4dfb2c142ba1734cf7c27bb347063768))
* upload the full summary when it is too large ([#27](https://github.com/CallumKerson/test-reports-action/issues/27)) ([2c4b384](https://github.com/CallumKerson/test-reports-action/commit/2c4b38466d1d6792043877779f845dd4620bb87a))
* write test results to the job summary ([#23](https://github.com/CallumKerson/test-reports-action/issues/23)) ([6d022fd](https://github.com/CallumKerson/test-reports-action/commit/6d022fda47ea6e914845b60451eacd2c12a0b4d5))


### Bug Fixes

* report empty and unparseable reports instead of stopping ([#32](https://github.com/CallumKerson/test-reports-action/issues/32)) ([0ce7e87](https://github.com/CallumKerson/test-reports-action/commit/0ce7e87748c66ba8fd616396e1c551a7f6499e82))
* round durations before choosing their unit ([#37](https://github.com/CallumKerson/test-reports-action/issues/37)) ([f834d8a](https://github.com/CallumKerson/test-reports-action/commit/f834d8a8cdaf4392e98ea4359c45a4d48456a4f3))
* set statuses on the triggering commit in workflow_run workflows ([#34](https://github.com/CallumKerson/test-reports-action/issues/34)) ([8d36835](https://github.com/CallumKerson/test-reports-action/commit/8d36835570a23ac49fdd7c7a95a83de707e3f23d))
* strip terminal colours from failure messages ([#35](https://github.com/CallumKerson/test-reports-action/issues/35)) ([c2643bd](https://github.com/CallumKerson/test-reports-action/commit/c2643bd7bdc26a933fa1f362643c7a93b3e32145))


### Performance Improvements

* find Go subtests in one pass rather than comparing every pair ([#36](https://github.com/CallumKerson/test-reports-action/issues/36)) ([cf2ec0c](https://github.com/CallumKerson/test-reports-action/commit/cf2ec0c5b2a16265f0a99fb4c62630d860036900))
