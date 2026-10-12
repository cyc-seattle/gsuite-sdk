Feature: Groups nest inside other groups

  Google can take up to 10 minutes to list a group inside another, and refuses a group inside itself.

  Scenario: A nested group isn't listed at first
    Given a group "Sailors"
    And a group "Juniors"
    When "Juniors" is added to "Sailors" as a member
    Then "Sailors" doesn't list "Juniors" yet

  Scenario: A nested group is listed 10 minutes later
    Given a group "Sailors"
    And a group "Juniors"
    And "Juniors" was just added to "Sailors"
    When 10 minutes pass
    Then "Sailors" lists "Juniors" as a member

  Scenario: A group can't join a group inside it
    Given a group "Sailors"
    And a group "Juniors"
    And "Juniors" is already in "Sailors" as a member
    When "Sailors" is added to "Juniors" as a member
    Then adding fails because it would make a cycle
