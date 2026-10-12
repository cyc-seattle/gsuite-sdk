Feature: Groups nest inside other groups

  Google refuses a group inside a group that it contains.

  Scenario: A group can't join a group inside it
    Given a group "Sailors"
    And a group "Juniors"
    And "Juniors" is already in "Sailors" as a member
    When "Sailors" is added to "Juniors" as a member
    Then adding fails because it would make a cycle
