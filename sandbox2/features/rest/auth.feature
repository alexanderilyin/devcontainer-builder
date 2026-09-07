Feature: BDD Framework for the rest-api fixture's five auth methods
  Scenario: API key, Basic, Bearer, OAuth2, and OpenID Connect authentication
    Given Directory known as "<RestApiChartDirectory>":
      | PROPERTY | VALUE            |
      | path     | ./charts/rest-api |
    And Helm Chart known as "<RestApiHelmChart>":
      | PROPERTY | VALUE                 |
      | chart    | <RestApiChartDirectory> |
    And Release known as "<AuthRelease>":
      | PROPERTY  | VALUE                |
      | chart     | <RestApiHelmChart>   |
      | name      | sandbox-auth-release |
      | namespace | sandbox2-helm-test   |
    When I upgrade Release known as "<AuthRelease>" with:
      | OPTION            | VALUE |
      | --install         | True  |
      | --atomic          | True  |
      | --create-namespace | True  |
    Then the command exited with 0

    Given Service known as "<AuthService>":
      | PROPERTY                   | VALUE                |
      | namespace                  | sandbox2-helm-test   |
      | app.kubernetes.io/instance | sandbox-auth-release |
    And RestEndpoint known as "<AuthApi>":
      | PROPERTY | VALUE        |
      | service  | <AuthService> |
      | port     | 8000         |

    When I send a POST request to RestEndpoint known as "<AuthApi>" path "/users/" with:
      | TYPE  | KEY             | VALUE       |
      | FIELD | username        | phase3-user |
      | FIELD | password        | secret      |
      | FIELD | api_key_enabled | true        |
      | FIELD | bearer_enabled  | true        |
    Then the response status is 201
    Given the value at "api_key" from the last response is known as "<ApiKey>"

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/api-key/whoami" with:
      | TYPE   | KEY      | VALUE      |
      | HEADER | X-API-Key | <ApiKey>   |
    Then the response status is 200
    Then the command result data has:
      | KEY      | CONDITION | VALUE       |
      | username | equals    | phase3-user |

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/api-key/whoami" with:
      | TYPE   | KEY      | VALUE         |
      | HEADER | X-API-Key | invalid-key   |
    Then the response status is 401

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/basic/whoami" with:
      | TYPE   | KEY           | VALUE                       |
      | HEADER | Authorization | Basic cGhhc2UzLXVzZXI6c2VjcmV0 |
    Then the response status is 200
    Then the command result data has:
      | KEY      | CONDITION | VALUE       |
      | username | equals    | phase3-user |

    When I send a POST request to RestEndpoint known as "<AuthApi>" path "/auth/token" with:
      | TYPE   | KEY          | VALUE                                      |
      | HEADER | Content-Type | application/x-www-form-urlencoded         |
      | BODY   |              | username=phase3-user&password=secret       |
    Then the response status is 200
    Given the value at "access_token" from the last response is known as "<BearerToken>"

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/bearer/whoami" with:
      | TYPE   | KEY           | VALUE                  |
      | HEADER | Authorization | Bearer <BearerToken>   |
    Then the response status is 200
    Then the command result data has:
      | KEY      | CONDITION | VALUE       |
      | username | equals    | phase3-user |

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/oauth/authorize" with:
      | TYPE  | KEY          | VALUE                                                                                         |
      | QUERY | client_id    | sandbox-client                                                                              |
      | QUERY | redirect_uri | https://client.example/callback                                                               |
      | QUERY | response_type | code                                                                                          |
      | QUERY | scope        | openid profile                                                                                |
      | QUERY | state        | phase3-state                                                                                  |
      | QUERY | username     | phase3-user                                                                                   |
      | QUERY | password     | secret                                                                                        |
    Then the response status is 302
    Then the response headers has:
      | KEY      | CONDITION | VALUE                         |
      | location | contains  | https://client.example/callback?code= |
    Given the query parameter "code" from response header "location" is known as "<AuthCode>"

    When I send a POST request to RestEndpoint known as "<AuthApi>" path "/oauth/token" with:
      | TYPE   | KEY          | VALUE                                                                        |
      | HEADER | Content-Type | application/x-www-form-urlencoded                                           |
      | BODY   |              | grant_type=authorization_code&code=<AuthCode>&client_id=sandbox-client&redirect_uri=https://client.example/callback |
    Then the response status is 200
    Given the value at "access_token" from the last response is known as "<OAuthAccessToken>"
    Given the value at "id_token" from the last response is known as "<IdToken>"

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/oauth2/whoami" with:
      | TYPE   | KEY           | VALUE                    |
      | HEADER | Authorization | Bearer <OAuthAccessToken> |
    Then the response status is 200

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/oauth/userinfo" with:
      | TYPE   | KEY           | VALUE                    |
      | HEADER | Authorization | Bearer <OAuthAccessToken> |
    Then the response status is 200
    Then the command result data has:
      | KEY                | CONDITION | VALUE       |
      | preferred_username  | equals    | phase3-user |

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/auth/openid/whoami" with:
      | TYPE   | KEY           | VALUE             |
      | HEADER | Authorization | Bearer <IdToken> |
    Then the response status is 200

    When I send a GET request to RestEndpoint known as "<AuthApi>" path "/.well-known/openid-configuration"
    Then the response status is 200
    Then the command result data has:
      | KEY                   | CONDITION | VALUE                     |
      | response_types_supported[0] | equals | code                      |
      | id_token_signing_alg_values_supported[0] | equals | RS256              |

    When I uninstall Release known as "<AuthRelease>" with:
      | OPTION | VALUE |
    Then the command exited with 0
