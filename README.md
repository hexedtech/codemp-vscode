[![codemp](https://codemp.dev/static/banner.png)](https://codemp.dev)

> `codemp` is a **collaborative** text editing solution to work remotely.

It seamlessly integrates in your editor providing remote cursors and instant text synchronization,
as well as a remote virtual workspace for you and your team.

# codemp-vscode

This is the reference codemp [vscode](https://code.visualstudio.com/) plugin maintained by [hexedtech](https://hexed.technology)

# installation
Clone the github repository and use vscode actions to compile and run the extension 

# usage
Interact with this plugin using the `codemp` command.


| command | description |
| --- | --- |
| `codemp.connect ` |  to connect to server using server ip, username and password from your config file |

once connected, more commands become available:

| command | description |
| --- | --- |
| `codemp.join <workspace>` |  will join requested workspace; starts processing cursors and users |
| `codemp.createWorkspace <workspace>` |  will create a new workspace with given name |
| `codemp.listWorkspaces` |  list all workspaces available to join |

after a workspace is joined, more commands become available:

| command | description |
| --- | --- |
| `codemp.attach <buffer>` |  will attach to requested buffer if it exists|
| `codemp.createBuffer <bufname>` |  will create a new empty buffer in workspace |
| `codemp.listBuffers` |  will list all available buffers in workspace |
| `codemp.sync` |  forces resynchronization of current buffer |


### quick start
 * first connect to server with `codemp.connect`
 * then join a workspace with `codemp.join <workspace>`
 * either attach directly to a buffer with `codemp.attach <buffer>` or browse available buffers with `codemp.listBuffers`


## example configuration (settings.json)


```
    "codemp-vscode": {
        "server" : "http://codemp.dev:50053",
        "username" : "test@codemp.dev",
        "password" : "test"

    }
```

