Feature: Group settings are read and changed

  Scenario: Reading a group's settings
    Given a group "Sailors"
    When the settings of "Sailors" are read
    Then "Sailors" lets people ask to join

  Scenario: Applying a settings template
    Given a group "Sailors"
    When "Sailors" gets the "announcement" settings
    Then the settings of "Sailors" match the "announcement" template
